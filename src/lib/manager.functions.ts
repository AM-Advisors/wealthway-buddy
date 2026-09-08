import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertReviewer(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "fund_manager"]);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Forbidden: reviewer access required.");
  return (data as any[]).map((r) => r.role as string);
}

/** Funds the signed-in reviewer can work in: assigned funds, or all funds for admins. */
export const getManagerFunds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const roles = await assertReviewer(supabase, userId);
    const isAdmin = roles.includes("admin");

    let offeringIds: string[] | null = null;
    if (!isAdmin) {
      const { data: assignments, error } = await supabase
        .from("fund_managers")
        .select("offering_id")
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
      offeringIds = [...new Set((assignments ?? []).map((a: any) => a.offering_id as string))];
      if (offeringIds.length === 0) return { isAdmin, funds: [] as any[] };
    }

    let query = supabase
      .from("offerings")
      .select("id, name, slug, reg_type, is_open, min_investment_cents, target_raise_cents")
      .order("name");
    if (offeringIds) query = query.in("id", offeringIds);

    const { data: funds, error: fundsError } = await query;
    if (fundsError) throw new Error(fundsError.message);
    return { isAdmin, funds: funds ?? [] };
  });

const overviewSchema = z.object({ offeringId: z.string().uuid() });

/** Investor roster plus stage counts for one fund. */
export const getFundOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => overviewSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertReviewer(supabase, userId);

    const { data: offering, error: offeringError } = await supabase
      .from("offerings")
      .select("id, name, reg_type, is_open, min_investment_cents, target_raise_cents")
      .eq("id", data.offeringId)
      .maybeSingle();
    if (offeringError) throw new Error(offeringError.message);
    if (!offering) throw new Error("Fund not found, or you do not have access to it.");

    const { data: rows, error } = await supabase
      .from("investor_applications")
      .select(
        "id, user_id, status, current_step, kyc_status, aml_status, accreditation_status, documents_status, funding_status, commitment_cents, submitted_at, created_at, updated_at",
      )
      .eq("offering_id", data.offeringId)
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const applications = rows ?? [];
    const userIds = [...new Set(applications.map((r: any) => r.user_id as string))];
    const { data: profiles } = userIds.length
      ? await supabase
          .from("profiles")
          .select("user_id, legal_name, email, investor_type")
          .in("user_id", userIds)
      : { data: [] as any[] };
    const profileMap = new Map((profiles ?? []).map((p: any) => [p.user_id, p]));

    const counts = {
      total: applications.length,
      identity: 0,
      accreditation: 0,
      documents: 0,
      funding: 0,
      complete: 0,
    };
    let committedCents = 0;
    let settledCents = 0;

    for (const app of applications as any[]) {
      committedCents += app.commitment_cents ?? 0;
      if (app.funding_status === "settled") {
        counts.complete += 1;
        settledCents += app.commitment_cents ?? 0;
        continue;
      }
      if (app.kyc_status !== "approved" || app.aml_status !== "approved") counts.identity += 1;
      else if (app.accreditation_status !== "approved") counts.accreditation += 1;
      else if (app.documents_status !== "approved") counts.documents += 1;
      else counts.funding += 1;
    }

    return {
      offering,
      counts,
      committedCents,
      settledCents,
      investors: (applications as any[]).map((app) => ({
        ...app,
        profile: profileMap.get(app.user_id) ?? null,
      })),
    };
  });

const opsSchema = z.object({ offeringId: z.string().uuid() });

/** Documents, wire confirmations, funding and open issue flags for one fund. */
export const getFundOperations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => opsSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertReviewer(supabase, userId);

    const { data: apps, error: appsError } = await supabase
      .from("investor_applications")
      .select("id, user_id, commitment_cents, documents_status, funding_status, updated_at")
      .eq("offering_id", data.offeringId)
      .limit(500);
    if (appsError) throw new Error(appsError.message);
    const applications = (apps ?? []) as any[];
    const appIds = applications.map((a) => a.id as string);

    const { data: docs, error: docsError } = await supabase
      .from("offering_documents")
      .select("id, title, doc_type, requires_signature, sort_order")
      .eq("offering_id", data.offeringId)
      .order("sort_order");
    if (docsError) throw new Error(docsError.message);
    const documents = (docs ?? []) as any[];

    const empty = { data: [] as any[] };
    const [{ data: sigs }, { data: wires }, { data: payments }, { data: profiles }, { data: flags }] =
      await Promise.all([
        appIds.length
          ? supabase
              .from("document_signatures")
              .select("id, application_id, offering_document_id, signed_at, provider_status, pdf_path")
              .in("application_id", appIds)
          : empty,
        appIds.length
          ? supabase
              .from("wire_confirmations")
              .select(
                "id, application_id, amount_cents, sent_on, sending_bank_name, sending_account_last4, bank_reference, investor_note, status, reviewed_at, review_notes, created_at",
              )
              .in("application_id", appIds)
              .order("created_at", { ascending: false })
          : empty,
        appIds.length
          ? supabase
              .from("payments")
              .select("id, application_id, method, amount_cents, status, reference_code, expected_date, confirmed_at")
              .in("application_id", appIds)
          : empty,
        applications.length
          ? supabase
              .from("profiles")
              .select("user_id, legal_name, email")
              .in("user_id", [...new Set(applications.map((a) => a.user_id as string))])
          : empty,
        supabase
          .from("application_flags")
          .select(
            "id, application_id, category, severity, note, status, created_at, created_by, resolved_at, resolution_note",
          )
          .eq("offering_id", data.offeringId)
          .order("created_at", { ascending: false }),
      ]);

    const profileMap = new Map((profiles ?? []).map((p: any) => [p.user_id, p]));
    const investorOf = (applicationId: string) => {
      const app = applications.find((a) => a.id === applicationId);
      const profile = app ? profileMap.get(app.user_id) : null;
      return {
        applicationId,
        name: (profile?.legal_name as string) ?? "Investor",
        email: (profile?.email as string) ?? null,
        commitmentCents: (app?.commitment_cents as number) ?? null,
      };
    };

    const requiredDocs = documents.filter((d) => d.requires_signature);
    const signatures = (sigs ?? []) as any[];
    const signedByApp = new Map<string, Set<string>>();
    for (const s of signatures) {
      if (!signedByApp.has(s.application_id)) signedByApp.set(s.application_id, new Set());
      signedByApp.get(s.application_id)!.add(s.offering_document_id);
    }

    const documentProgress = applications
      .map((app) => {
        const signed = signedByApp.get(app.id) ?? new Set<string>();
        const outstanding = requiredDocs.filter((d) => !signed.has(d.id));
        const lastSigned = signatures
          .filter((s) => s.application_id === app.id && s.signed_at)
          .map((s) => s.signed_at as string)
          .sort()
          .pop();
        return {
          ...investorOf(app.id),
          signedCount: requiredDocs.length - outstanding.length,
          requiredCount: requiredDocs.length,
          outstanding: outstanding.map((d) => d.title as string),
          lastSignedAt: lastSigned ?? null,
        };
      })
      .sort((a, b) => a.outstanding.length === b.outstanding.length ? 0 : b.outstanding.length - a.outstanding.length);

    const wireConfirmations = ((wires ?? []) as any[]).map((w) => ({ ...w, investor: investorOf(w.application_id) }));
    const paymentRows = ((payments ?? []) as any[]).map((p) => ({ ...p, investor: investorOf(p.application_id) }));

    const funding = {
      awaiting: paymentRows.filter((p) => p.status === "awaiting_wire" || p.status === "processing").length,
      settled: paymentRows.filter((p) => p.status === "settled").length,
      failed: paymentRows.filter((p) => p.status === "failed" || p.status === "returned").length,
      settledCents: paymentRows
        .filter((p) => p.status === "settled")
        .reduce((sum, p) => sum + (p.amount_cents ?? 0), 0),
      pendingCents: paymentRows
        .filter((p) => p.status === "awaiting_wire" || p.status === "processing")
        .reduce((sum, p) => sum + (p.amount_cents ?? 0), 0),
    };

    return {
      documents,
      requiredDocCount: requiredDocs.length,
      documentProgress,
      wireConfirmations,
      pendingWireCount: wireConfirmations.filter((w) => w.status === "pending" || w.status === "submitted").length,
      payments: paymentRows,
      funding,
      flags: ((flags ?? []) as any[]).map((f) => ({ ...f, investor: investorOf(f.application_id) })),
      applications: applications.map((a) => investorOf(a.id)),
    };
  });

const flagSchema = z.object({
  applicationId: z.string().uuid(),
  offeringId: z.string().uuid(),
  category: z.enum(["identity", "accreditation", "documents", "funding", "other"]),
  severity: z.enum(["normal", "urgent"]),
  note: z.string().trim().min(3).max(2000),
});

/** Raise a delay or issue flag against an investor's application. */
export const raiseApplicationFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => flagSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertReviewer(supabase, userId);
    const { data: row, error } = await supabase
      .from("application_flags")
      .insert({
        application_id: data.applicationId,
        offering_id: data.offeringId,
        category: data.category,
        severity: data.severity,
        note: data.note,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

const resolveSchema = z.object({
  flagId: z.string().uuid(),
  resolutionNote: z.string().trim().max(2000).optional(),
});

/** Close out a flag once the delay or issue has been handled. */
export const resolveApplicationFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => resolveSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertReviewer(supabase, userId);
    const { error } = await supabase
      .from("application_flags")
      .update({
        status: "resolved",
        resolved_by: userId,
        resolved_at: new Date().toISOString(),
        resolution_note: data.resolutionNote ?? null,
      })
      .eq("id", data.flagId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
