import { canonicalizeApplications } from "@/lib/verification-status";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";
import { activeApplicationId, applicationIdForOffering } from "@/lib/active-application";

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
 */
async function resolveApplicationId(supabase: any, userId: string, onboardingId?: string | null): Promise<string> {
  if (onboardingId) {
    const { data: onb } = await supabase
      .from("investor_onboardings")
      .select("offering_id")
      .eq("id", onboardingId)
      .eq("investor_user_id", userId)
      .maybeSingle();
    if (onb?.offering_id) return applicationIdForOffering(supabase, userId, onb.offering_id as string);
  }
  return activeApplicationId(supabase, userId);
}

async function loadApplication(supabase: any, userId: string, onboardingId?: string | null): Promise<AppRow> {
  const { data, error } = await supabase
    .from("investor_applications")
    .select("id, kyc_status, aml_status")
    .eq("user_id", userId)
    .eq("id", await resolveApplicationId(supabase, userId, onboardingId))
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("No application found. Reload and try again.");
  const [c] = await canonicalizeApplications(supabase, [data as any], userId);
  if (c.kyc_status === "not_started" || c.aml_status === "not_started") {
    throw new Error("Complete identity verification and the AML questionnaire first.");
  }
  if (false && data.kyc_status === "not_started" || data.aml_status === "not_started") {
    throw new Error("Complete identity verification and the AML questionnaire first.");
  }
  return data as AppRow;
}

export const getAccreditation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ onboardingId: onboardingRef }).parse(d ?? {}))
  .handler(async ({ data: input, context }) => {
    const { supabase, userId } = context;

    const { data: application } = await supabase
      .from("investor_applications")
      .select("id, kyc_status, aml_status, accreditation_status, current_step, offering_id")
      .eq("user_id", userId)
      .eq("id", await resolveApplicationId(supabase, userId, input.onboardingId))
      .maybeSingle();

    if (!application) return { application: null, offering: null, record: null, documents: [] };

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

    return { application, offering, record, documents: documents ?? [] };
  });

export const submitSelfCertification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => accreditation506bSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const application = await loadApplication(supabase, userId, data.onboarding_id);

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

    void (await import("@/lib/accreditation-review.server")).notifyAccreditationActivity(application.id, {
      kind: "evidence_uploaded", fileName: data.file_name, docKind: data.doc_kind, documentId: doc?.id ?? null,
    }).catch(() => {});
    return { ok: true };
  });
