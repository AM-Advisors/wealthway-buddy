import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { activeApplicationId } from "@/lib/active-application";
import { logComplianceEvent } from "@/lib/kyc-aml.server";

/**
 * KYC / AML submissions: the investor's own view of what they filed, the
 * fund's review of it, and the trail that both sides read.
 */

export const COMPLIANCE_DOC_KINDS = [
  { value: "identification", label: "Government ID" },
  { value: "proof_of_address", label: "Proof of address" },
  { value: "entity_formation", label: "Entity formation documents" },
  { value: "trust_agreement", label: "Trust agreement" },
  { value: "bank_letter", label: "Source of funds / bank letter" },
  { value: "tax_form", label: "Tax form (W-9 / W-8)" },
  { value: "other", label: "Other supporting document" },
] as const;

const docKinds = COMPLIANCE_DOC_KINDS.map((k) => k.value) as [string, ...string[]];
const checkKinds = ["kyc", "aml", "accreditation"] as const;

export type ComplianceTrailRow = {
  id: string;
  checkKind: string;
  action: string;
  actorRole: string;
  actorName: string | null;
  note: string | null;
  payload: Record<string, any>;
  createdAt: string;
};

async function reviewerRole(supabase: any, userId: string, offeringId: string) {
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "fund_manager"]);
  const list = ((roles ?? []) as any[]).map((r) => String(r.role));
  if (list.includes("admin")) return "admin" as const;
  if (!list.includes("fund_manager")) throw new Error("Forbidden: reviewer access required.");

  const { data: assigned } = await supabase
    .from("fund_managers")
    .select("id")
    .eq("user_id", userId)
    .eq("offering_id", offeringId)
    .maybeSingle();
  if (!assigned) throw new Error("Forbidden: you do not manage this fund.");
  return "fund_manager" as const;
}

async function trailFor(supabase: any, applicationIds: string[]) {
  if (applicationIds.length === 0) return new Map<string, ComplianceTrailRow[]>();
  const { data: rows } = await supabase
    .from("compliance_submissions")
    .select("id, application_id, check_kind, action, actor_id, actor_role, note, payload, created_at")
    .in("application_id", applicationIds)
    .order("created_at", { ascending: false });

  const list = (rows ?? []) as any[];
  const actorIds = Array.from(
    new Set(list.map((r) => r.actor_id as string | null).filter(Boolean) as string[]),
  );
  const { data: profiles } = actorIds.length
    ? await supabase.from("profiles").select("user_id, legal_name").in("user_id", actorIds)
    : { data: [] };
  const nameBy = new Map(
    ((profiles ?? []) as any[]).map((p) => [String(p.user_id), (p.legal_name as string) ?? null]),
  );

  const out = new Map<string, ComplianceTrailRow[]>();
  for (const r of list) {
    const key = String(r.application_id);
    const items = out.get(key) ?? [];
    items.push({
      id: String(r.id),
      checkKind: String(r.check_kind),
      action: String(r.action),
      actorRole: String(r.actor_role),
      actorName: r.actor_id ? (nameBy.get(String(r.actor_id)) ?? null) : null,
      note: (r.note as string | null) ?? null,
      payload: (r.payload as Record<string, any>) ?? {},
      createdAt: String(r.created_at),
    });
    out.set(key, items);
  }
  return out;
}

/** The investor's own KYC/AML page. */
export const getMyComplianceCase = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: application } = await supabase
      .from("investor_applications")
      .select(
        "id, offering_id, kyc_status, aml_status, accreditation_status, documents_status, funding_status",
      )
      .eq("user_id", userId)
      .eq("id", await activeApplicationId(supabase, userId))
      .maybeSingle();

    if (!application) {
      return { application: null, offering: null, documents: [], trail: [] as ComplianceTrailRow[] };
    }

    const [{ data: offering }, { data: documents }, trailMap] = await Promise.all([
      supabase
        .from("offerings")
        .select("id, name, reg_type")
        .eq("id", application.offering_id)
        .maybeSingle(),
      supabase
        .from("investor_documents")
        .select("id, file_name, doc_kind, note, uploaded_at, review_status, review_note")
        .eq("application_id", application.id)
        .order("uploaded_at", { ascending: false }),
      trailFor(supabase, [String(application.id)]),
    ]);

    return {
      application,
      offering: offering ?? null,
      documents: (documents ?? []) as any[],
      trail: trailMap.get(String(application.id)) ?? [],
    };
  });

/** Fund-side detail for one investor: files plus the full trail. */
export const getInvestorComplianceDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ offeringId: z.string().uuid(), applicationId: z.string().uuid() })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const role = await reviewerRole(supabase, userId, data.offeringId);

    const { data: application } = await supabase
      .from("investor_applications")
      .select("id, user_id, offering_id, kyc_status, aml_status, accreditation_status")
      .eq("id", data.applicationId)
      .maybeSingle();
    if (!application || String(application.offering_id) !== data.offeringId) {
      throw new Error("That investor is not in this fund.");
    }

    const [{ data: documents }, trailMap, { data: kyc }, { data: aml }] = await Promise.all([
      supabase
        .from("investor_documents")
        .select("id, file_name, doc_kind, note, uploaded_at, review_status")
        .eq("application_id", application.id)
        .order("uploaded_at", { ascending: false }),
      trailFor(supabase, [String(application.id)]),
      supabase
        .from("kyc_verifications")
        .select("result, status")
        .eq("application_id", application.id)
        .maybeSingle(),
      supabase
        .from("aml_screenings")
        .select("matches, status")
        .eq("application_id", application.id)
        .maybeSingle(),
    ]);

    return {
      role,
      application,
      documents: (documents ?? []) as any[],
      trail: trailMap.get(String(application.id)) ?? [],
      kycResult: (kyc as any)?.result ?? null,
      amlAnswers: ((aml as any)?.matches as any)?.answers ?? null,
    };
  });

/** A fund manager or admin filing a document they received for an investor. */
export const recordFundUploadForInvestor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        offeringId: z.string().uuid(),
        applicationId: z.string().uuid(),
        storage_path: z.string().min(1).max(500),
        file_name: z.string().min(1).max(255),
        doc_kind: z.enum(docKinds),
        note: z.string().max(500).optional().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const role = await reviewerRole(supabase, userId, data.offeringId);

    const { data: application } = await supabase
      .from("investor_applications")
      .select("id, user_id, offering_id")
      .eq("id", data.applicationId)
      .maybeSingle();
    if (!application || String(application.offering_id) !== data.offeringId) {
      throw new Error("That investor is not in this fund.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("investor_documents").insert({
      application_id: application.id,
      offering_id: application.offering_id,
      user_id: application.user_id,
      storage_path: data.storage_path,
      file_name: data.file_name,
      doc_kind: data.doc_kind,
      note: data.note?.trim() ? data.note.trim() : "Received by the fund team",
    });
    if (error) throw new Error(error.message);

    await logComplianceEvent(supabase, {
      applicationId: String(application.id),
      offeringId: String(application.offering_id),
      userId: String(application.user_id),
      actorId: userId,
      actorRole: role,
      checkKind: "documents",
      action: "document_added",
      payload: { file_name: data.file_name, doc_kind: data.doc_kind, on_behalf: true },
      note: data.note ?? null,
    });

    return { ok: true };
  });

/** Approve, decline or ask for more information on one check. */
export const decideComplianceCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        offeringId: z.string().uuid(),
        applicationId: z.string().uuid(),
        checkKind: z.enum(checkKinds),
        decision: z.enum(["approved", "declined", "info_requested"]),
        note: z.string().trim().max(1000).optional().or(z.literal("")),
      })
      .superRefine((value, ctx) => {
        if (value.decision !== "approved" && !value.note?.trim()) {
          ctx.addIssue({
            code: "custom",
            path: ["note"],
            message: "Add a note explaining what the investor needs to do.",
          });
        }
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const role = await reviewerRole(supabase, userId, data.offeringId);

    const { data: application } = await supabase
      .from("investor_applications")
      .select("id, user_id, offering_id")
      .eq("id", data.applicationId)
      .maybeSingle();
    if (!application || String(application.offering_id) !== data.offeringId) {
      throw new Error("That investor is not in this fund.");
    }

    const status =
      data.decision === "approved"
        ? "approved"
        : data.decision === "declined"
          ? "declined"
          : "pending";
    const now = new Date().toISOString();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const statusColumn =
      data.checkKind === "kyc"
        ? "kyc_status"
        : data.checkKind === "aml"
          ? "aml_status"
          : "accreditation_status";

    const appUpdate = await (supabaseAdmin as any)
      .from("investor_applications")
      .update({ [statusColumn]: status, updated_at: now })
      .eq("id", application.id);
    if (appUpdate.error) throw new Error(appUpdate.error.message);

    if (data.checkKind === "kyc") {
      await supabaseAdmin
        .from("kyc_verifications")
        .update({
          status,
          completed_at: data.decision === "approved" ? now : null,
          updated_at: now,
        })
        .eq("application_id", application.id);
    } else if (data.checkKind === "aml") {
      await supabaseAdmin
        .from("aml_screenings")
        .update({
          status,
          completed_at: data.decision === "approved" ? now : null,
          updated_at: now,
        })
        .eq("application_id", application.id);
    } else {
      await supabaseAdmin
        .from("accreditation_records")
        .update({
          status,
          verified_at: data.decision === "approved" ? now : null,
          review_notes: data.note?.trim() || null,
          updated_at: now,
        })
        .eq("application_id", application.id);
    }

    await logComplianceEvent(supabase, {
      applicationId: String(application.id),
      offeringId: String(application.offering_id),
      userId: String(application.user_id),
      actorId: userId,
      actorRole: role,
      checkKind: data.checkKind,
      action: data.decision,
      payload: { status },
      note: data.note ?? null,
    });

    return { ok: true, status };
  });
