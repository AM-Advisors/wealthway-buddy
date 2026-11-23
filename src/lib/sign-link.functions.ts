/**
 * "Sign now" links for one investor and one document. Staff or that fund's managers only.
 * The link is our own investment page; signing still needs the investor's own sign-in,
 * the signing verification gate, and the signing service's record. Sends reuse sendSigningReminder.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";
import { signLinkPath, signLinkReadiness } from "@/lib/sign-link";

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
  const readiness = signLinkReadiness({
    removed: !!ob.removed_at,
    email,
    requiresSignature: !!doc?.requires_signature,
    documentInFund: doc?.offering_id === data.fundId,
    investorSigned: signed,
    identityVerified: String(person?.kyc_status ?? "") === "approved",
  });
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

/** Readiness, the current link's evidence, and (on Copy) a fresh no-sign-in link that replaces the old one. */
export const signLinkFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((x: unknown) => input.extend({ withLink: z.boolean().optional() }).parse(x))
  .handler(async ({ data, context }) => {
    const f = await facts(context.userId, data);
    const active = await activeLink(data);
    if (!f.readiness.ready) return { ready: false, reason: f.readiness.reason, url: null as string | null, active };
    if (!data.withLink) return { ready: true, reason: null, url: null as string | null, active };
    return { ready: true, reason: null, url: await newLink(context.userId, data, f.email!), active };
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
