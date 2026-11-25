import { canonicalizeApplications } from "@/lib/verification-status";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";
import { activeApplicationId, linkedApplicationForInvestment } from "@/lib/active-application";
import { pickAccreditationInvestment } from "@/lib/accreditation-investment";
import { accreditationIdentityLocked, selfCertificationAllowed } from "@/lib/accreditation-step";

const onboardingRef = z.string().uuid().optional();

export const accreditation506bSchema = z.object({
  basis: z.enum([
    "income",
    "net_worth",
    "professional_certification",
    "entity_assets",
    "knowledgeable_employee",
  ]),
  income_last_two_years: z.boolean(),
  net_worth_over_1m: z.boolean(),
  professional_license: z.string().trim().max(120).optional().or(z.literal("")),
  pre_existing_relationship: z
    .string()
    .trim()
    .min(10, "Describe your relationship with the fund manager")
    .max(600),
  attested_signature: z.string().trim().min(2, "Type your full legal name").max(120),
  attests: z.literal(true),
  onboarding_id: onboardingRef,
});

export const accreditation506cSchema = z.object({
  method: z.enum(["income_documents", "net_worth_documents", "professional_license", "entity_documents", "third_party_letter"]),
  professional_license: z.string().trim().max(120).optional().or(z.literal("")),
  verifier_name: z.string().trim().max(160).optional().or(z.literal("")),
  verifier_role: z.enum(["cpa", "attorney", "investment_adviser", "broker_dealer", ""]).optional(),
  attested_signature: z.string().trim().min(2, "Type your full legal name").max(120),
  attests: z.literal(true),
  onboarding_id: onboardingRef,
});

export const evidenceSchema = z.object({
  storage_path: z.string().trim().min(3).max(400),
  file_name: z.string().trim().min(1).max(200),
  doc_kind: z.enum(["w2", "tax_return", "brokerage_statement", "credit_report", "verification_letter", "other"]),
  onboarding_id: onboardingRef,
});

type AppRow = { id: string; kyc_status: string; aml_status: string };

/**
 * The application for the investment the investor came from. The onboarding ID
 * only narrows to a fund the signed-in investor owns; otherwise the active account is used.
 * The investment's own linked application wins. When the investment has none
 * yet (for example its identity check was reused from the login), saving paths
 * pass `link: true` to create the one record through the same guarded step
 * verification uses; reads never create anything.
 */
/**
 * The investment this step is for. The address wins; without one, the
 * investor's only open investment is used, and several open investments are
 * returned as choices so the investor picks one (never a guess).
 */
async function resolveOnboardingTarget(
  supabase: any,
  userId: string,
  onboardingId?: string | null,
): Promise<{ onboardingId: string | null; choices: string[] }> {
  if (onboardingId) return { onboardingId, choices: [] };
  const { data } = await supabase
    .from("investor_onboardings")
    .select("id, offering_id, stage, removed_at, closed_at, merged_into_onboarding_id")
    .eq("investor_user_id", userId)
    .order("created_at", { ascending: true });
  const pick = pickAccreditationInvestment((data ?? []) as any[]);
  if (pick.kind === "one") return { onboardingId: pick.onboardingId, choices: [] };
  if (pick.kind === "many") return { onboardingId: null, choices: pick.onboardingIds };
  return { onboardingId: null, choices: [] };
}

async function resolveApplicationId(
  supabase: any,
  userId: string,
  requestedOnboardingId?: string | null,
  opts: { link?: boolean } = {},
): Promise<string> {
  const target = await resolveOnboardingTarget(supabase, userId, requestedOnboardingId);
  const onboardingId = target.onboardingId;
  if (!onboardingId && target.choices.length > 1 && opts.link) {
    throw new Error("Choose which investment this is for. Go to your home page and choose Continue on the investment.");
  }
  if (onboardingId) {
    const { data: onb } = await supabase
      .from("investor_onboardings")
      .select("application_id")
      .eq("id", onboardingId)
      .eq("investor_user_id", userId)
      .maybeSingle();
    // The investment's own application only; never an older same-fund record.
    if (onb) return linkedApplicationForInvestment(supabase, { id: onboardingId, application_id: onb.application_id }, opts);
  }
  return activeApplicationId(supabase, userId);
}

async function loadApplication(supabase: any, userId: string, onboardingId?: string | null): Promise<AppRow> {
  const { data, error } = await supabase
    .from("investor_applications")
    .select("id, kyc_status, aml_status")
    .eq("user_id", userId)
    .eq("id", await resolveApplicationId(supabase, userId, onboardingId, { link: true }))
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("No application found. Reload and try again.");
  const [c] = await canonicalizeApplications(supabase, [data as any], userId);
  if (accreditationIdentityLocked(c)) {
    throw new Error("Complete identity verification and the AML questionnaire first.");
  }
  return data as AppRow;
}

export const getAccreditation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ onboardingId: onboardingRef }).parse(d ?? {}))
  .handler(async ({ data: input, context }) => {
    const { supabase, userId } = context;
    const target = await resolveOnboardingTarget(supabase, userId, input.onboardingId);

    if (!target.onboardingId && target.choices.length > 1) {
      // Several open investments and the address didn't say which: let the investor choose.
      const { data: rows } = await supabase
        .from("investor_onboardings")
        .select("id, offering_id")
        .eq("investor_user_id", userId)
        .in("id", target.choices);
      const offeringIds = [...new Set(((rows ?? []) as any[]).map((r) => r.offering_id).filter(Boolean))];
      const { data: funds } = offeringIds.length
        ? await supabase.from("offerings").select("id, name").in("id", offeringIds)
        : { data: [] as any[] };
      const nameOf = new Map(((funds ?? []) as any[]).map((f) => [f.id, f.name as string]));
      const choices = target.choices.map((id) => {
        const r = ((rows ?? []) as any[]).find((x) => x.id === id);
        return { onboardingId: id, fundName: nameOf.get(r?.offering_id) ?? "Your investment" };
      });
      return { application: null, offering: null, record: null, documents: [], onboardingId: null, choices };
    }

    const onboardingId = target.onboardingId;
    const { data: application } = await supabase
      .from("investor_applications")
      .select("id, kyc_status, aml_status, accreditation_status, current_step, offering_id")
      .eq("user_id", userId)
      .eq("id", await resolveApplicationId(supabase, userId, onboardingId))
      .maybeSingle();

    if (application) {
      // The verified identity lives on the person record; the application row can
      // still say not_started when the check was reused. Read the canonical result.
      const [canonical] = await canonicalizeApplications(supabase, [{ ...application, user_id: userId } as any], userId);
      application.kyc_status = canonical.kyc_status;
      application.aml_status = canonical.aml_status;
    }

    if (!application) {
      // Not linked yet: still show the fund's own rules (never a default form).
      let offering: { id: string; name: string; reg_type: string; min_investment_cents: number | null } | null = null;
      if (onboardingId) {
        const { data: onb } = await supabase
          .from("investor_onboardings")
          .select("offering_id")
          .eq("id", onboardingId)
          .eq("investor_user_id", userId)
          .maybeSingle();
        if (onb?.offering_id) {
          const { data: o } = await supabase
            .from("offerings")
            .select("id, name, reg_type, min_investment_cents")
            .eq("id", onb.offering_id)
            .maybeSingle();
          offering = (o as any) ?? null;
        }
      }
      return { application: null, offering, record: null, documents: [], onboardingId, choices: [] };
    }

    const { data: offering } = await supabase
      .from("offerings")
      .select("id, name, reg_type, min_investment_cents")
      .eq("id", application.offering_id)
      .maybeSingle();

    const { data: record } = await supabase
      .from("accreditation_records")
      .select("*")
      .eq("application_id", application.id)
      .maybeSingle();

    const { data: documents } = await supabase
      .from("accreditation_documents")
      .select("id, file_name, doc_kind, uploaded_at")
      .eq("application_id", application.id)
      .order("uploaded_at", { ascending: false });

    return { application, offering, record, documents: documents ?? [], onboardingId, choices: [] as { onboardingId: string; fundName: string }[] };
  });

export const submitSelfCertification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => accreditation506bSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const application = await loadApplication(supabase, userId, data.onboarding_id);

    // Self-certification only completes accreditation on a 506(b) fund; a
    // 506(c) fund needs paperwork reviewed by the manager or Harmonious.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: appRow } = await admin
      .from("investor_applications")
      .select("id, user_id, offering_id, accreditation_status")
      .eq("id", application.id)
      .maybeSingle();
    if (!appRow || appRow.user_id !== userId) throw new Error("No application found. Reload and try again.");
    const { data: fund } = await admin.from("offerings").select("reg_type").eq("id", appRow.offering_id).maybeSingle();
    if (!fund || !selfCertificationAllowed((fund as any).reg_type)) {
      throw new Error("This fund requires verified accreditation. Upload proof or a verification letter.");
    }
    if (appRow.accreditation_status === "approved") return { ok: true, status: "approved" as const };

    const qualifies =
      data.income_last_two_years ||
      data.net_worth_over_1m ||
      data.basis === "professional_certification" ||
      data.basis === "entity_assets" ||
      data.basis === "knowledgeable_employee";

    if (!qualifies) {
      throw new Error(
        "Based on your answers you do not currently meet the accredited investor standard for this offering.",
      );
    }

    const now = new Date().toISOString();
    const payload = {
      application_id: application.id,
      reg_type: "506b" as const,
      method: data.basis,
      questionnaire: {
        ...data,
        onboarding_id: undefined,
        submitted_at: now,
      },
      qualifies: true,
      pre_existing_relationship: data.pre_existing_relationship,
      attested_at: now,
      attested_signature: data.attested_signature,
      // 506(b): the investor's own certification completes accreditation; no reviewer.
      status: "approved" as const,
      verified_at: now,
      updated_at: now,
    };

    const existing = await admin
      .from("accreditation_records")
      .select("id, status")
      .eq("application_id", application.id)
      .maybeSingle();

    // Verified stays verified: a later submission never moves an approved accreditation back to review.
    if ((existing.data as any)?.status === "approved") return { ok: true, alreadyApproved: true } as any;

    if (existing.data) {
      const { error } = await admin
        .from("accreditation_records")
        .update(payload)
        .eq("id", existing.data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await admin.from("accreditation_records").insert(payload);
      if (error) throw new Error(error.message);
    }

    const { error: appError } = await admin
      .from("investor_applications")
      .update({ accreditation_status: "approved", current_step: "documents", updated_at: now })
      .eq("id", application.id);
    if (appError) throw new Error(appError.message);

    void (await import("@/lib/manager-alerts.server")).drainManagerAlerts().catch(() => {});
    return { ok: true, status: "approved" as const };
  });

export const submitVerificationRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => accreditation506cSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const application = await loadApplication(supabase, userId, data.onboarding_id);

    const { count } = await supabase
      .from("accreditation_documents")
      .select("id", { count: "exact", head: true })
      .eq("application_id", application.id);

    if (!count) {
      throw new Error("Upload at least one verification document before submitting.");
    }

    const now = new Date().toISOString();
    const expires = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

    const payload = {
      application_id: application.id,
      reg_type: "506c" as const,
      method: data.method,
      questionnaire: { ...data, submitted_at: now },
      qualifies: null,
      attested_at: now,
      attested_signature: data.attested_signature,
      status: "review" as const,
      expires_at: expires,
      updated_at: now,
    };

    const existing = await supabase
      .from("accreditation_records")
      .select("id")
      .eq("application_id", application.id)
      .maybeSingle();

    if (existing.data) {
      const { error } = await supabase
        .from("accreditation_records")
        .update(payload)
        .eq("id", existing.data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("accreditation_records").insert(payload);
      if (error) throw new Error(error.message);
    }

    const { error: appError } = await supabase
      .from("investor_applications")
      .update({ accreditation_status: "review", current_step: "documents", updated_at: now })
      .eq("id", application.id);
    if (appError) throw new Error(appError.message);

    void (await import("@/lib/manager-alerts.server")).drainManagerAlerts().catch(() => {});
    void (await import("@/lib/accreditation-review.server")).notifyAccreditationPending(application.id).catch(() => {});
    void (await import("@/lib/accreditation-ai.server")).checkPendingDocuments(application.id).catch(() => {});
    return { ok: true, status: "review" as const, expiresAt: expires };
  });

export const recordEvidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => evidenceSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const application = await loadApplication(supabase, userId, data.onboarding_id);

    if (!data.storage_path.startsWith(`${userId}/`)) {
      throw new Error("Invalid upload path.");
    }

    const { data: doc, error } = await supabase.from("accreditation_documents").insert({
      application_id: application.id,
      storage_path: data.storage_path,
      file_name: data.file_name,
      doc_kind: data.doc_kind,
    }).select("id").single();
    if (error) throw new Error(error.message);

    // An uploaded proof moves accreditation to "under review" so the investor isn't asked again.
    // Never downgrades an approved accreditation.
    {
      const { supabaseAdmin: d } = await import("@/integrations/supabase/client.server");
      const now = new Date().toISOString();
      const { data: existing } = await d.from("accreditation_records").select("id, status").eq("application_id", application.id).maybeSingle();
      if (!existing) await d.from("accreditation_records").insert({ application_id: application.id, reg_type: "506c", method: data.doc_kind === "verification_letter" ? "third_party_letter" : "documents", status: "review", qualifies: null, updated_at: now } as never);
      else if (existing.status !== "approved") await d.from("accreditation_records").update({ status: "review", updated_at: now } as never).eq("id", existing.id);
      const { data: appRow } = await d.from("investor_applications").select("accreditation_status").eq("id", application.id).maybeSingle();
      if (appRow?.accreditation_status !== "approved") await d.from("investor_applications").update({ accreditation_status: "review", updated_at: now } as never).eq("id", application.id);
      if (doc?.id) void (await import("@/lib/accreditation-ai.server")).checkDocument(doc.id, null).catch(() => {});
    }

    void (await import("@/lib/accreditation-review.server")).notifyAccreditationActivity(application.id, {
      kind: "evidence_uploaded", fileName: data.file_name, docKind: data.doc_kind, documentId: doc?.id ?? null,
    }).catch(() => {});
    return { ok: true };
  });
