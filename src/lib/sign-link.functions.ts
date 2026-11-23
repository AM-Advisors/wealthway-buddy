/**
 * "Sign now" links for one investor and one document. Staff or that fund's managers only.
 * The link is our own investment page; signing still needs the investor's own sign-in,
 * the signing verification gate, and the signing service's record. Sends reuse sendSigningReminder.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";
import { PROVIDER_EMAIL_EVENTS, providerEmailAction, signLinkPath, signLinkReadiness } from "@/lib/sign-link";

const input = z.object({
  fundId: z.string().uuid(),
  onboardingId: z.string().uuid(),
  documentId: z.string().uuid(),
  overrideReason: z.string().trim().max(500).optional(),
});

async function facts(userId: string, data: z.infer<typeof input>) {
  const { assertFund } = await import("@/lib/fund-tabs.server");
  await assertFund(userId, data.fundId);
  const d = (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
  const { data: ob } = await d.from("investor_onboardings").select("id, offering_id, application_id, investor_user_id, person_id, removed_at").eq("id", data.onboardingId).maybeSingle();
  if (!ob || ob.offering_id !== data.fundId) throw new Error("That investor isn't in this fund.");
  const [{ data: doc }, { data: person }] = await Promise.all([
    d.from("offering_documents").select("id, offering_id, title, requires_signature").eq("id", data.documentId).maybeSingle(),
    ob.person_id ? d.from("persons").select("email, kyc_status, legal_first_name, legal_last_name, preferred_name").eq("id", ob.person_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  let signed = false;
  if (ob.application_id) {
    const { data: rows } = await d.from("document_signature_signers").select("status, role_key").eq("application_id", ob.application_id).eq("offering_document_id", data.documentId);
    signed = ((rows ?? []) as any[]).some((r) => r.role_key !== "fund_manager" && r.status === "signed");
  }
  const contact = ob.investor_user_id ? await (await import("@/lib/user-contact.server")).loadUserContact(d, ob.investor_user_id) : null;
  const email = (contact?.email || person?.email || null) as string | null;
  const name = (contact?.name || person?.preferred_name || [person?.legal_first_name, person?.legal_last_name].filter(Boolean).join(" ") || "there") as string;
  const base = {
    removed: !!ob.removed_at,
    email,
    requiresSignature: !!doc?.requires_signature,
    documentInFund: doc?.offering_id === data.fundId,
    investorSigned: signed,
    identityVerified: String(person?.kyc_status ?? "") === "approved",
  };
  // Same gate the signing page uses, so a link is never sent that would stop at "not ready to sign".
  let readiness = signLinkReadiness(base);
  if (readiness.ready) {
    const { onboardingSigningBlockers } = await import("@/lib/investor-onboarding.server");
    readiness = signLinkReadiness({ ...base, signingBlockers: await onboardingSigningBlockers(ob.id) });
  }
  return { ob, doc, email, name, readiness };
}

async function newLink(userId: string, data: z.infer<typeof input>, email: string) {
  const d = (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
  const { issueSigningLink } = await import("@/lib/signing-access-link.server");
  const token = await issueSigningLink(d, { onboardingId: data.onboardingId, offeringId: data.fundId, documentId: data.documentId, email, createdBy: userId });
  const { PORTAL_ORIGIN } = await import("@/lib/account-invite.server");
  return `${PORTAL_ORIGIN}/api/public/sign/${token}`;
}

async function activeLink(data: z.infer<typeof input>) {
  const d = (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
  const { data: row } = await d.from("signing_access_links").select("created_at, opened_at, expires_at, revoked_at, used_at")
    .eq("onboarding_id", data.onboardingId).eq("offering_document_id", data.documentId).is("revoked_at", null).is("used_at", null)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  const { linkState } = await import("@/lib/signing-access-link");
  return row && linkState(row) === "active" ? { sentAt: row.created_at as string, openedAt: (row.opened_at ?? null) as string | null, expiresAt: row.expires_at as string } : null;
}

async function currentSignature(applicationId: string | null, documentId: string) {
  if (!applicationId) return null;
  const d = (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
  const { data } = await d.from("document_signatures").select("id, provider_agreement_id, provider_status, provider_delivery, provider_sent_at, provider_viewed_at")
    .eq("application_id", applicationId).eq("offering_document_id", documentId).maybeSingle();
  return data ?? null;
}

/** The open copy the signing service emailed the investor, if any. */
function providerEmailState(sig: any) {
  return sig && providerEmailAction({ delivery: sig.provider_delivery, providerStatus: sig.provider_status, agreementId: sig.provider_agreement_id }) === "resend"
    ? { sentAt: sig.provider_sent_at as string | null, openedAt: (sig.provider_viewed_at ?? null) as string | null }
    : null;
}

/** Readiness, the current link's evidence, and (on Copy) a fresh no-sign-in link that replaces the old one. */
export const signLinkFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((x: unknown) => input.extend({ withLink: z.boolean().optional() }).parse(x))
  .handler(async ({ data, context }) => {
    const f = await facts(context.userId, data);
    const active = await activeLink(data);
    const providerEmail = providerEmailState(await currentSignature(f.ob.application_id ?? null, data.documentId));
    if (!f.readiness.ready) return { ready: false, reason: f.readiness.reason, url: null as string | null, active, providerEmail };
    if (!data.withLink) return { ready: true, reason: null, url: null as string | null, active, providerEmail };
    return { ready: true, reason: null, url: await newLink(context.userId, data, f.email!), active, providerEmail };
  });

/** Emails a fresh no-sign-in link through the shared signing email (24h limit, Super Admin override, audited). */
export const sendSignLinkFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((x: unknown) => input.parse(x))
  .handler(async ({ data, context }) => {
    const f = await facts(context.userId, data);
    if (!f.readiness.ready) throw new Error(f.readiness.reason ?? "This can't be sent yet.");
    const { sendSigningReminder } = await import("@/lib/signing-reminder.server");
    const key = `sign-link:${data.onboardingId}:${data.documentId}`;
    // Respect the 24-hour limit before replacing the previous link.
    const d = (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
    const { data: recent } = await d.from("document_reminders").select("id").eq("reminder_key", key).eq("delivered", true).gte("created_at", new Date(Date.now() - 86400_000).toISOString()).limit(1);
    if ((recent ?? []).length) {
      if (!data.overrideReason) throw new Error("A link for this was already sent in the last 24 hours.");
      const { data: sa } = await d.from("user_roles").select("role").eq("user_id", context.userId).eq("role", "super_admin").maybeSingle();
      if (!sa) throw new Error("A link for this was already sent in the last 24 hours. Only a Super Admin can send another today.");
    }
    const ctaUrl = await newLink(context.userId, data, f.email!);
    return sendSigningReminder(context.userId, {
      offeringId: data.fundId, reminderKey: key, documentTitle: f.doc?.title ?? "your subscription document",
      recipientEmail: f.email!, recipientName: f.name, recipientUserId: f.ob.investor_user_id ?? null,
      path: signLinkPath(data.onboardingId, data.documentId), ctaUrl,
      steps: ["Press Sign now (no sign-in needed)", "Press Review and sign", "Sign the document"],
      override: data.overrideReason ? { reason: data.overrideReason } : null,
    });
  });

/** Cancels the current no-sign-in link at once. */
export const revokeSignLinkFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((x: unknown) => input.parse(x))
  .handler(async ({ data, context }) => {
    await facts(context.userId, data);
    const d = (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
    await d.from("signing_access_links").update({ revoked_at: new Date().toISOString() })
      .eq("onboarding_id", data.onboardingId).eq("offering_document_id", data.documentId).is("revoked_at", null).is("used_at", null);
    const { logFundAudit } = await import("@/lib/fund-audit.server");
    await logFundAudit(context.userId, { offeringId: data.fundId, eventType: "signing_link_cancelled", summary: "No-sign-in signing link cancelled", values: { onboarding: data.onboardingId, document: data.documentId } }).catch(() => null);
    return { ok: true };
  });

/**
 * Has the signing service email the investor directly (its own email, no Harmonious sign-in).
 * Same readiness and verification as the sign link; an open emailed copy is resent, otherwise a
 * fresh request replaces any open copy and cancels Harmonious sign links. One a day, Super Admin override, audited.
 */
export const signingServiceEmailFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((x: unknown) => input.parse(x))
  .handler(async ({ data, context }) => {
    const f = await facts(context.userId, data);
    if (!f.readiness.ready) throw new Error(f.readiness.reason ?? "This can't be sent yet.");
    if (!f.ob.application_id) throw new Error("This investment isn't ready for signing yet.");
    const d = (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
    const sig = await currentSignature(f.ob.application_id, data.documentId);
    if (sig?.id) {
      const { data: recent } = await d.from("signature_audit_events").select("id").eq("signature_id", sig.id)
        .in("event_type", [...PROVIDER_EMAIL_EVENTS]).gte("created_at", new Date(Date.now() - 86400_000).toISOString()).limit(1);
      if ((recent ?? []).length) {
        if (!data.overrideReason) throw new Error("The signing service already emailed this in the last 24 hours.");
        const { data: sa } = await d.from("user_roles").select("role").eq("user_id", context.userId).eq("role", "super_admin").maybeSingle();
        if (!sa) throw new Error("The signing service already emailed this in the last 24 hours. Only a Super Admin can send another today.");
      }
    }
    const action = providerEmailAction({ delivery: sig?.provider_delivery ?? null, providerStatus: sig?.provider_status ?? null, agreementId: sig?.provider_agreement_id ?? null });
    let signatureId: string | null = sig?.id ?? null;
    if (action === "resend") {
      const { resendSignRequest } = await import("@/lib/box.server");
      await resendSignRequest(sig.provider_agreement_id);
    } else {
      // Harmonious sign links would replace the emailed copy, so they stop now.
      await d.from("signing_access_links").update({ revoked_at: new Date().toISOString() })
        .eq("onboarding_id", data.onboardingId).eq("offering_document_id", data.documentId).is("revoked_at", null).is("used_at", null);
      const { PORTAL_ORIGIN } = await import("@/lib/account-invite.server");
      const { sendSigningByProviderEmail } = await import("@/lib/document-signing.server");
      await sendSigningByProviderEmail(d, { onboardingId: data.onboardingId, offeringDocumentId: data.documentId, signerEmail: f.email!, redirectUrl: `${PORTAL_ORIGIN}/api/public/sign/done` });
      signatureId = (await currentSignature(f.ob.application_id, data.documentId))?.id ?? null;
    }
    await d.from("signature_audit_events").insert({
      application_id: f.ob.application_id, signature_id: signatureId,
      event_type: action === "resend" ? "provider_email_resent" : "provider_email_sent",
      metadata: { by: context.userId, recipient: f.email, ...(data.overrideReason ? { override_reason: data.overrideReason } : {}) },
    });
    const { logFundAudit } = await import("@/lib/fund-audit.server");
    await logFundAudit(context.userId, {
      offeringId: data.fundId, eventType: "signing_service_email", summary: action === "resend" ? "Signing service email resent to the investor" : "Signing service emailed the investor directly",
      values: { onboarding: data.onboardingId, document: data.documentId, ...(data.overrideReason ? { override_reason: data.overrideReason } : {}) },
    }).catch(() => null);
    return { recipientEmail: f.email, resent: action === "resend" };
  });
