// Administrator investor database: every investor on file, the step they are
// on right now, and manual editing of their details when something needs
// correcting by hand.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logReviewerActivity } from "@/lib/reviewer-activity.server";

const CHECK_STATUSES = [
  "not_started",
  "pending",
  "review",
  "approved",
  "declined",
] as const;

export const STEP_LABELS: Record<string, string> = {
  identity: "Identity check",
  screening: "Screening",
  accreditation: "Accreditation",
  accreditation_approval: "Awaiting accreditation approval",
  documents: "Fund documents",
  manager_approval: "Awaiting manager approval",
  funding: "Funding",
  funded: "Funds received",
  no_application: "No application yet",
};

export interface InvestorRow {
  user_id: string;
  application_id: string | null;
  account_label: string | null;
  account_kind: string | null;
  offering_id: string | null;
  offeringName: string | null;
  legal_name: string | null;
  email: string | null;
  phone: string | null;
  entity_name: string | null;
  investor_type: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  address_line1: string | null;
  address_line2: string | null;
  postal_code: string | null;
  step: string;
  kyc_status: string | null;
  aml_status: string | null;
  accreditation_status: string | null;
  documents_status: string | null;
  funding_status: string | null;
  manager_review_status: string | null;
  status: string | null;
  commitment_cents: number | null;
  created_at: string | null;
  updated_at: string | null;
}

function stepFor(app: any): string {
  if (!app) return "no_application";
  if (app.funding_status === "settled") return "funded";
  if (app.kyc_status !== "approved") return "identity";
  if (app.aml_status !== "approved") return "screening";
  if (app.accreditation_status === "review" || app.accreditation_status === "pending")
    return "accreditation_approval";
  if (app.accreditation_status !== "approved") return "accreditation";
  if (app.documents_status !== "approved") return "documents";
  if (app.manager_review_status && app.manager_review_status !== "approved")
    return "manager_approval";
  return "funding";
}

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden: administrator access required.");
}

export const listInvestors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const [{ data: profiles }, { data: apps }, { data: offerings }, { data: roles }] =
      await Promise.all([
        supabase
          .from("profiles")
          .select(
            "user_id, email, legal_name, investor_type, phone, entity_name, address_line1, address_line2, city, region, postal_code, country, created_at, updated_at",
          )
          .order("created_at", { ascending: false })
          .limit(1000),
        supabase
          .from("investor_applications")
          .select(
            "id, user_id, offering_id, persona_id, status, kyc_status, aml_status, accreditation_status, documents_status, funding_status, manager_review_status, commitment_cents, created_at, updated_at",
          )
          .order("created_at", { ascending: false })
          .limit(1000),
        supabase.from("offerings").select("id, name"),
        supabase.from("investor_personas").select("id, label, kind"),
        supabase.from("user_roles").select("user_id, role"),
      ]);

    // Only people who are investors here: skip staff accounts with no application.
    const staff = new Set(
      ((roles ?? []) as any[])
        .filter((r) => r.role === "admin" || r.role === "fund_manager")
        .map((r) => r.user_id as string),
    );

    const fundName = new Map(((offerings ?? []) as any[]).map((o) => [o.id, o.name as string]));
    const personaById = new Map(((personas ?? []) as any[]).map((x) => [x.id as string, x]));

    // One row per application, so an investor running several accounts or
    // several funds at once shows up once for each of them.
    const profileByUser = new Map(((profiles ?? []) as any[]).map((p) => [p.user_id as string, p]));
    const usersWithApps = new Set(((apps ?? []) as any[]).map((a) => a.user_id as string));

    const pairs: Array<{ p: any; app: any }> = [];
    for (const a of (apps ?? []) as any[]) {
      const p = profileByUser.get(a.user_id as string);
      if (p) pairs.push({ p, app: a });
    }
    for (const p of (profiles ?? []) as any[]) {
      if (!usersWithApps.has(p.user_id) && !staff.has(p.user_id)) pairs.push({ p, app: null });
    }

    const investors: InvestorRow[] = pairs
      .map(({ p, app }) => {
        const persona = app?.persona_id ? personaById.get(app.persona_id as string) : null;
        return {
          user_id: p.user_id,
          application_id: app?.id ?? null,
          account_label: (persona?.label as string) ?? null,
          account_kind: (persona?.kind as string) ?? null,
          offering_id: app?.offering_id ?? null,
          offeringName: app?.offering_id ? (fundName.get(app.offering_id) ?? null) : null,
          legal_name: p.legal_name ?? null,
          email: p.email ?? null,
          phone: p.phone ?? null,
          entity_name: p.entity_name ?? null,
          investor_type: p.investor_type ?? null,
          city: p.city ?? null,
          region: p.region ?? null,
          country: p.country ?? null,
          address_line1: p.address_line1 ?? null,
          address_line2: p.address_line2 ?? null,
          postal_code: p.postal_code ?? null,
          step: stepFor(app),
          kyc_status: app?.kyc_status ?? null,
          aml_status: app?.aml_status ?? null,
          accreditation_status: app?.accreditation_status ?? null,
          documents_status: app?.documents_status ?? null,
          funding_status: app?.funding_status ?? null,
          manager_review_status: app?.manager_review_status ?? null,
          status: app?.status ?? null,
          commitment_cents: app?.commitment_cents ?? null,
          created_at: p.created_at ?? null,
          updated_at: app?.updated_at ?? p.updated_at ?? null,
        };
      });

    const funds = ((offerings ?? []) as any[])
      .map((o) => ({ id: o.id as string, name: o.name as string }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return { investors, funds };
  });

const detailsSchema = z.object({
  user_id: z.string().uuid(),
  application_id: z.string().uuid().nullable().optional(),
  legal_name: z.string().max(200).nullable().optional(),
  email: z.string().email().max(200).nullable().optional(),
  phone: z.string().max(60).nullable().optional(),
  entity_name: z.string().max(200).nullable().optional(),
  investor_type: z
    .enum(["individual", "joint", "entity", "trust", "ira"])
    .nullable()
    .optional(),
  address_line1: z.string().max(200).nullable().optional(),
  address_line2: z.string().max(200).nullable().optional(),
  city: z.string().max(120).nullable().optional(),
  region: z.string().max(120).nullable().optional(),
  postal_code: z.string().max(30).nullable().optional(),
  country: z.string().max(120).nullable().optional(),
  commitment_cents: z.number().int().min(0).max(100_000_000_000).nullable().optional(),
});

function clean(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

/** Manual correction of an investor's details by an administrator. */
export const updateInvestorDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => detailsSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const profilePatch: Record<string, unknown> = {
      legal_name: clean(data.legal_name),
      email: clean(data.email),
      phone: clean(data.phone),
      entity_name: clean(data.entity_name),
      address_line1: clean(data.address_line1),
      address_line2: clean(data.address_line2),
      city: clean(data.city),
      region: clean(data.region),
      postal_code: clean(data.postal_code),
      country: clean(data.country),
      updated_at: new Date().toISOString(),
    };
    if (data.investor_type) profilePatch['investor_type'] = data.investor_type;

    const { error } = await supabase
      .from("profiles")
      .update(profilePatch as never)
      .eq("user_id", data.user_id);
    if (error) throw new Error(error.message);

    if (data.application_id && data.commitment_cents !== undefined) {
      const { error: appError } = await supabase
        .from("investor_applications")
        .update({
          commitment_cents: data.commitment_cents,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", data.application_id);
      if (appError) throw new Error(appError.message);
    }

    if (data.application_id) {
      const { data: app } = await supabase
        .from("investor_applications")
        .select("offering_id")
        .eq("id", data.application_id)
        .maybeSingle();
      await logReviewerActivity(supabase, {
        actorId: userId,
        applicationId: data.application_id,
        offeringId: (app?.offering_id as string) ?? null,
        action: "investor_details_edited",
        area: "application",
        outcome: "updated",
        summary: "Edited the investor's details by hand",
        note: null,
      });
    }

    return { ok: true };
  });

const statusSchema = z.object({
  application_id: z.string().uuid(),
  area: z.enum(["kyc", "aml", "accreditation", "documents"]),
  decision: z.enum(CHECK_STATUSES),
  notes: z.string().max(1000).nullable().optional(),
});

/**
 * Sets one onboarding check by hand. Accreditation approval is the gate that
 * has to clear before an investor can reach the wire step.
 */
export const setInvestorCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => statusSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const now = new Date().toISOString();

    const { error } = await supabase
      .from("investor_applications")
      .update({ [`${data.area}_status`]: data.decision, updated_at: now } as never)
      .eq("id", data.application_id);
    if (error) throw new Error(error.message);

    if (data.area === "accreditation") {
      const { data: record } = await supabase
        .from("accreditation_records")
        .select("id")
        .eq("application_id", data.application_id)
        .maybeSingle();
      if (record) {
        await supabase
          .from("accreditation_records")
          .update({
            status: data.decision,
            reviewer_id: userId,
            review_notes: clean(data.notes),
            verified_at: data.decision === "approved" ? now : null,
            updated_at: now,
          } as never)
          .eq("id", record.id);
      }
    }

    if (data.notes?.trim()) {
      await supabase.from("admin_notes").insert({
        application_id: data.application_id,
        author_id: userId,
        body: `[${data.area} → ${data.decision}] ${data.notes.trim()}`,
      } as never);
    }

    const { data: app } = await supabase
      .from("investor_applications")
      .select("offering_id")
      .eq("id", data.application_id)
      .maybeSingle();

    await logReviewerActivity(supabase, {
      actorId: userId,
      applicationId: data.application_id,
      offeringId: (app?.offering_id as string) ?? null,
      action: "application_decision",
      area: data.area,
      outcome: data.decision === "review" ? "delayed" : data.decision,
      summary: `${data.area} marked ${data.decision.replace(/_/g, " ")}`,
      note: clean(data.notes),
    });

    void (await import("@/lib/manager-alerts.server")).drainManagerAlerts().catch(() => {});
    return { ok: true };
  });
