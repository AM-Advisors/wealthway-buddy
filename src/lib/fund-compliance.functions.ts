import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Investor checks, read from inside the fund. Admins see every fund; a fund
 * manager sees only the funds assigned to them. Row-level security enforces
 * the same rule on every table below, so this is scope plus presentation.
 */

async function assertFundReviewer(supabase: any, userId: string, offeringId: string) {
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "fund_manager"]);
  const list = ((roles ?? []) as any[]).map((r) => r.role as string);
  if (list.includes("admin")) return { isAdmin: true };
  if (!list.includes("fund_manager")) throw new Error("Forbidden: reviewer access required.");

  const { data: assigned } = await supabase
    .from("fund_managers")
    .select("id")
    .eq("user_id", userId)
    .eq("offering_id", offeringId)
    .maybeSingle();
  if (!assigned) throw new Error("Forbidden: you do not manage this fund.");
  return { isAdmin: false };
}

export type ComplianceEvidence = {
  id: string;
  source: "accreditation" | "upload";
  fileName: string;
  kind: string;
  uploadedAt: string | null;
};

export const getFundInvestorCompliance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ offeringId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { isAdmin } = await assertFundReviewer(supabase, userId, data.offeringId);

    const [{ data: offering }, { data: applications }] = await Promise.all([
      supabase
        .from("offerings")
        .select("id, name, reg_type")
        .eq("id", data.offeringId)
        .maybeSingle(),
      supabase
        .from("investor_applications")
        .select(
          "id, user_id, status, commitment_cents, kyc_status, aml_status, accreditation_status, documents_status, funding_status, updated_at",
        )
        .eq("offering_id", data.offeringId)
        .order("updated_at", { ascending: false }),
    ]);

    const apps = (applications ?? []) as any[];
    if (apps.length === 0) {
      return { offering: offering ?? null, isAdmin, investors: [], counts: emptyCounts() };
    }

    const appIds = apps.map((a) => a.id as string);
    const userIds = Array.from(new Set(apps.map((a) => a.user_id as string)));

    const [
      { data: profiles },
      { data: kyc },
      { data: aml },
      { data: accreditation },
      { data: accreditationDocs },
      { data: uploads },
    ] = await Promise.all([
      supabase.from("profiles").select("user_id, legal_name, email").in("user_id", userIds),
      supabase
        .from("kyc_verifications")
        .select("application_id, provider, status, completed_at, expired_at, updated_at")
        .in("application_id", appIds),
      supabase
        .from("aml_screenings")
        .select("application_id, provider, status, matches, completed_at, updated_at")
        .in("application_id", appIds),
      supabase
        .from("accreditation_records")
        .select(
          "application_id, reg_type, method, status, qualifies, attested_at, attested_signature, verified_at, expires_at, review_notes, updated_at",
        )
        .in("application_id", appIds),
      supabase
        .from("accreditation_documents")
        .select("id, application_id, file_name, doc_kind, uploaded_at")
        .in("application_id", appIds),
      supabase
        .from("investor_documents")
        .select("id, application_id, file_name, doc_kind, uploaded_at")
        .in("application_id", appIds),
    ]);

    const profileBy = new Map(((profiles ?? []) as any[]).map((p) => [String(p.user_id), p]));
    const kycBy = new Map(((kyc ?? []) as any[]).map((r) => [String(r.application_id), r]));
    const amlBy = new Map(((aml ?? []) as any[]).map((r) => [String(r.application_id), r]));
    const accBy = new Map(
      ((accreditation ?? []) as any[]).map((r) => [String(r.application_id), r]),
    );

    const evidenceBy = new Map<string, ComplianceEvidence[]>();
    for (const d of (accreditationDocs ?? []) as any[]) {
      const list = evidenceBy.get(String(d.application_id)) ?? [];
      list.push({
        id: String(d.id),
        source: "accreditation",
        fileName: (d.file_name as string) ?? "Document",
        kind: String(d.doc_kind ?? "other"),
        uploadedAt: (d.uploaded_at as string) ?? null,
      });
      evidenceBy.set(String(d.application_id), list);
    }
    for (const d of (uploads ?? []) as any[]) {
      if (!d.application_id) continue;
      const list = evidenceBy.get(String(d.application_id)) ?? [];
      list.push({
        id: String(d.id),
        source: "upload",
        fileName: (d.file_name as string) ?? "Document",
        kind: String(d.doc_kind ?? "other"),
        uploadedAt: (d.uploaded_at as string) ?? null,
      });
      evidenceBy.set(String(d.application_id), list);
    }

    const soon = Date.now() + 30 * 24 * 60 * 60 * 1000;
    const counts = emptyCounts();

    const investors = apps.map((app) => {
      const profile = profileBy.get(String(app.user_id));
      const k = kycBy.get(String(app.id));
      const a = amlBy.get(String(app.id));
      const acc = accBy.get(String(app.id));
      const matches = Array.isArray(a?.matches) ? a.matches.length : 0;
      const expiresAt = (acc?.expires_at as string | null) ?? null;
      const expiringSoon =
        Boolean(expiresAt) && new Date(expiresAt as string).getTime() < soon;
      const clear =
        app.kyc_status === "approved" &&
        app.aml_status === "approved" &&
        app.accreditation_status === "approved";

      if (clear) counts.clear += 1;
      else counts.outstanding += 1;
      if (expiringSoon) counts.expiring += 1;
      if (matches > 0) counts.amlMatches += 1;

      return {
        applicationId: String(app.id),
        name: (profile?.legal_name as string | null) ?? "Investor",
        email: (profile?.email as string | null) ?? null,
        commitmentCents: Number(app.commitment_cents ?? 0),
        kyc: {
          status: String(app.kyc_status),
          provider: (k?.provider as string | null) ?? null,
          decidedAt: (k?.completed_at as string | null) ?? (k?.updated_at as string | null) ?? null,
          expiredAt: (k?.expired_at as string | null) ?? null,
        },
        aml: {
          status: String(app.aml_status),
          provider: (a?.provider as string | null) ?? null,
          decidedAt: (a?.completed_at as string | null) ?? (a?.updated_at as string | null) ?? null,
          matches,
        },
        accreditation: {
          status: String(app.accreditation_status),
          regType: (acc?.reg_type as string | null) ?? (offering?.reg_type as string | null) ?? null,
          method: (acc?.method as string | null) ?? null,
          attestedBy: (acc?.attested_signature as string | null) ?? null,
          decidedAt:
            (acc?.verified_at as string | null) ?? (acc?.attested_at as string | null) ?? null,
          expiresAt,
          expiringSoon,
          notes: (acc?.review_notes as string | null) ?? null,
        },
        documentsStatus: String(app.documents_status),
        fundingStatus: String(app.funding_status),
        clear,
        evidence: (evidenceBy.get(String(app.id)) ?? []).sort((x, y) =>
          (y.uploadedAt ?? "").localeCompare(x.uploadedAt ?? ""),
        ),
      };
    });

    counts.total = investors.length;
    return { offering: offering ?? null, isAdmin, investors, counts };
  });

function emptyCounts() {
  return { total: 0, clear: 0, outstanding: 0, expiring: 0, amlMatches: 0 };
}

/** Short-lived link to one investor's evidence file, for this fund's reviewers. */
export const getComplianceEvidenceUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        offeringId: z.string().uuid(),
        source: z.enum(["accreditation", "upload"]),
        id: z.string().uuid(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertFundReviewer(supabase, userId, data.offeringId);

    if (data.source === "upload") {
      const { data: row } = await supabase
        .from("investor_documents")
        .select("id, storage_path, file_name, offering_id")
        .eq("id", data.id)
        .maybeSingle();
      if (!row || String(row.offering_id) !== data.offeringId) {
        throw new Error("That file is not available.");
      }
      const { data: signed, error } = await supabase.storage
        .from("investor-uploads")
        .createSignedUrl(row.storage_path as string, 300);
      if (error || !signed) throw new Error(error?.message ?? "Could not open that file.");
      await logView(supabase, userId, data.offeringId, row.file_name as string);
      return { url: signed.signedUrl };
    }

    const { data: doc } = await supabase
      .from("accreditation_documents")
      .select("id, application_id, storage_path, file_name")
      .eq("id", data.id)
      .maybeSingle();
    if (!doc) throw new Error("That file is not available.");

    const { data: app } = await supabase
      .from("investor_applications")
      .select("offering_id")
      .eq("id", doc.application_id as string)
      .maybeSingle();
    if (!app || String(app.offering_id) !== data.offeringId) {
      throw new Error("That file is not available.");
    }

    const { data: signed, error } = await supabase.storage
      .from("accreditation-docs")
      .createSignedUrl(doc.storage_path as string, 300);
    if (error || !signed) throw new Error(error?.message ?? "Could not open that file.");
    await logView(supabase, userId, data.offeringId, doc.file_name as string);
    return { url: signed.signedUrl };
  });

async function logView(supabase: any, userId: string, offeringId: string, fileName: string) {
  const { logLegalDocumentView } = await import("./legal-doc-views.server");
  await logLegalDocumentView(
    supabase,
    userId,
    { id: offeringId, offering_id: offeringId, title: `Investor evidence: ${fileName}`, file_name: fileName },
    "viewed",
  );
}
