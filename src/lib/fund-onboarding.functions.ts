/**
 * Fund-specific investor onboarding settings, countersigning and secure wire
 * reveal. Authority is always resolved from the signed-in user's actual
 * relationship to the fund — never from a role label or browser input.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
}

/** Admin, or a CURRENT fund_managers assignment for this exact offering. */
export async function fundAuthority(supabase: any, userId: string, offeringId: string) {
  const { data: role } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (role) return { allowed: true, isStaff: true };
  const { data } = await supabase
    .from("fund_managers")
    .select("id")
    .eq("user_id", userId)
    .eq("offering_id", offeringId)
    .maybeSingle();
  return { allowed: Boolean(data), isStaff: false };
}

const mask = (v: unknown) => {
  const s = String(v ?? "").replace(/\s+/g, "");
  return s.length >= 4 ? `•••• ${s.slice(-4)}` : s ? "••••" : "";
};

export const getFundOnboardingSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ offeringId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const auth = await fundAuthority(context.supabase, context.userId, data.offeringId);
    if (!auth.allowed) throw new Error("Forbidden: you are not assigned to this fund.");
    const db = await admin();
    const { signingConfigComplete } = await import("@/lib/fund-onboarding-model");

    const [{ data: offering }, { data: docs }, { data: managers }, { data: setup }] = await Promise.all([
      db.from("offerings").select("id, name, reg_type").eq("id", data.offeringId).maybeSingle(),
      db
        .from("offering_documents")
        .select("id, title, requires_signature, signing_mode, countersigner_user_id, investor_required, signature_template_version, sort_order")
        .eq("offering_id", data.offeringId)
        .order("sort_order", { ascending: true }),
      db.from("fund_managers").select("user_id").eq("offering_id", data.offeringId),
      db.from("fund_setups").select("id").eq("offering_id", data.offeringId).maybeSingle(),
    ]);
    const managerIds = ((managers ?? []) as any[]).map((m) => m.user_id);
    const { data: people } = managerIds.length
      ? await db.from("profiles").select("user_id, legal_name, email").in("user_id", managerIds)
      : { data: [] };
    const docIds = ((docs ?? []) as any[]).map((d) => d.id);
    const { data: blocks } = docIds.length
      ? await db
          .from("offering_document_signature_blocks")
          .select("offering_document_id, signer_role, block_type")
          .in("offering_document_id", docIds)
      : { data: [] };
    const { data: banking } = setup?.id
      ? await db
          .from("fund_banking_setups")
          .select("status, investor_instructions_released, bank_name, account_number, updated_at")
          .eq("setup_id", setup.id)
          .maybeSingle()
      : { data: null };

    const reg = String(offering?.reg_type ?? "").toLowerCase();
    return {
      offeringName: offering?.name ?? "Fund",
      accreditation:
        reg === "506c"
          ? "Rule 506(c): independent accreditation verification is required for every investor."
          : "Rule 506(b): investors complete the fund's accreditation questionnaire.",
      verification: "Identity verification (KYC), entity verification and beneficial owners (KYB) where applicable, and AML screening.",
      countersigners: ((people ?? []) as any[]).map((p) => ({ userId: p.user_id, name: p.legal_name ?? p.email })),
      documents: ((docs ?? []) as any[]).map((d) => {
        const mine = ((blocks ?? []) as any[]).filter((b) => b.offering_document_id === d.id);
        return {
          id: d.id as string,
          title: d.title as string,
          requiresSignature: Boolean(d.requires_signature),
          investorRequired: d.investor_required !== false,
          signingMode: (d.signing_mode ?? "investor_only") as "investor_only" | "dual",
          countersignerUserId: (d.countersigner_user_id ?? null) as string | null,
          templateVersion: Number(d.signature_template_version ?? 1),
          readiness: d.requires_signature
            ? signingConfigComplete({
                mode: d.signing_mode ?? "investor_only",
                countersignerUserId: d.countersigner_user_id ?? null,
                blocks: mine,
              })
            : { ready: true, missing: [] },
        };
      }),
      funding: banking
        ? {
            released: Boolean(banking.investor_instructions_released) && banking.status === "account_active",
            bankName: banking.bank_name ?? null,
            accountMasked: mask(banking.account_number),
            version: banking.updated_at ?? null,
          }
        : { released: false, bankName: null, accountMasked: "", version: null },
    };
  });

export const saveDocumentSigningConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      documentId: z.string().uuid(),
      signingMode: z.enum(["investor_only", "dual"]),
      countersignerUserId: z.string().uuid().nullable(),
      investorRequired: z.boolean(),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: doc } = await db
      .from("offering_documents")
      .select("id, offering_id, signature_template_version")
      .eq("id", data.documentId)
      .maybeSingle();
    if (!doc) throw new Error("That document no longer exists.");
    const auth = await fundAuthority(context.supabase, context.userId, doc.offering_id);
    if (!auth.allowed) throw new Error("Forbidden: you are not assigned to this fund.");
    let countersigner: string | null = null;
    if (data.signingMode === "dual") {
      if (!data.countersignerUserId) throw new Error("Choose the authorized fund signatory.");
      const { data: rel } = await db
        .from("fund_managers")
        .select("id")
        .eq("offering_id", doc.offering_id)
        .eq("user_id", data.countersignerUserId)
        .maybeSingle();
      if (!rel) throw new Error("That person is not currently assigned to this fund.");
      countersigner = data.countersignerUserId;
    }
    const { error } = await db
      .from("offering_documents")
      .update({
        signing_mode: data.signingMode,
        countersigner_user_id: countersigner,
        investor_required: data.investorRequired,
        signature_template_version: Number(doc.signature_template_version ?? 1) + 1,
      })
      .eq("id", doc.id);
    if (error) throw new Error(error.message);
    await db.from("offering_audit_events").insert({
      offering_id: doc.offering_id,
      offering_document_id: doc.id,
      event_type: "document_updated",
      summary: `Signing set to ${data.signingMode === "dual" ? "investor then fund manager" : "investor only"}`,
      changes: [{ field: "signing_mode", from: "", to: data.signingMode }],
      actor_id: context.userId,
    });
    return { ok: true };
  });

/** Wire instructions for one investment — fresh sign-in required, audited. */
export const revealWireInstructionsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ onboardingId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const engine = await import("@/lib/investor-onboarding.server");
    return engine.revealWireInstructions(context.userId, data.onboardingId, context.claims);
  });
