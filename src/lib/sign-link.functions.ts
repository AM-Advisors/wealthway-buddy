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

/** Readiness plus a copyable link (personal invite first for someone who has never signed in). */
export const signLinkFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((x: unknown) => input.extend({ withLink: z.boolean().optional() }).parse(x))
  .handler(async ({ data, context }) => {
    const f = await facts(context.userId, data);
    if (!f.readiness.ready) return { ready: false, reason: f.readiness.reason, url: null as string | null };
    // Readiness only: a personal invite is made only when someone presses Copy.
    if (!data.withLink) return { ready: true, reason: null, url: null as string | null };
    const { PORTAL_ORIGIN, setPasswordLink } = await import("@/lib/account-invite.server");
    const path = signLinkPath(data.onboardingId, data.documentId);
    let url = `${PORTAL_ORIGIN}${path}`;
    if (f.ob.investor_user_id) {
      const d = (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
      const { data: u } = await d.auth.admin.getUserById(f.ob.investor_user_id);
      if (!u?.user?.last_sign_in_at) {
        const link = await setPasswordLink(d, f.email!, context.userId);
        if (link.includes("/invite/")) url = `${link}?next=${encodeURIComponent(path)}`;
      }
    }
    return { ready: true, reason: null, url };
  });

/** Emails the Sign now link through the shared signing email (24h limit, Super Admin override, audited). */
export const sendSignLinkFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator((x: unknown) => input.parse(x))
  .handler(async ({ data, context }) => {
    const f = await facts(context.userId, data);
    if (!f.readiness.ready) throw new Error(f.readiness.reason ?? "This can't be sent yet.");
    const { sendSigningReminder } = await import("@/lib/signing-reminder.server");
    return sendSigningReminder(context.userId, {
      offeringId: data.fundId,
      reminderKey: `sign-link:${data.onboardingId}:${data.documentId}`,
      documentTitle: f.doc?.title ?? "your subscription document",
      recipientEmail: f.email!,
      recipientName: f.name,
      recipientUserId: f.ob.investor_user_id ?? null,
      path: signLinkPath(data.onboardingId, data.documentId),
      steps: ["Press Sign now and sign in", "Press Open document to sign", "Sign, then come back to the page"],
      override: data.overrideReason ? { reason: data.overrideReason } : null,
    });
  });
