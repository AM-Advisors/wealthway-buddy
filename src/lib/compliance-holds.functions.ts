import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const HOLD_SCOPES = [
  { value: "investor_onboarding", label: "Investor onboarding" },
  { value: "banking", label: "Bank activity" },
  { value: "wires", label: "Wires" },
  { value: "distributions", label: "Distributions" },
  { value: "filings", label: "Regulatory filings" },
  { value: "entity_actions", label: "Entity actions" },
  { value: "document_execution", label: "Document execution" },
  { value: "account_activity", label: "Account activity" },
  { value: "service_delivery", label: "Service delivery" },
] as const;

export const HOLD_REASONS = [
  { value: "kyc_incomplete", label: "KYC incomplete" },
  { value: "kyb_incomplete", label: "KYB incomplete" },
  { value: "aml_concern", label: "AML concern" },
  { value: "sanctions_concern", label: "Sanctions concern" },
  { value: "beneficial_owner", label: "Beneficial-owner verification" },
  { value: "source_of_funds", label: "Source-of-funds concern" },
  { value: "accreditation_incomplete", label: "Accreditation incomplete" },
  { value: "tax_docs_incomplete", label: "Tax documentation incomplete" },
  { value: "fraud_concern", label: "Fraud concern" },
  { value: "cyber_concern", label: "Cybersecurity concern" },
  { value: "unauthorized_activity", label: "Unauthorised activity" },
  { value: "bank_restriction", label: "Bank restriction" },
  { value: "provider_restriction", label: "Third-party provider restriction" },
  { value: "missing_approval", label: "Missing client approval" },
  { value: "missing_documents", label: "Missing client documents" },
  { value: "past_due_invoice", label: "Past-due undisputed invoice" },
  { value: "regulatory_issue", label: "Regulatory issue" },
] as const;

const STAFF = [
  "admin",
  "super_admin",
  "operations",
  "legal",
  "compliance",
  "fund_administration",
  "tax",
  "finance",
  "client_success",
  "executive",
];

async function rolesOf(context: any) {
  const { data } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  return ((data ?? []) as any[]).map((r) => String(r.role));
}

async function requireStaff(context: any) {
  const roles = await rolesOf(context);
  if (!roles.some((r) => STAFF.includes(r))) {
    throw new Error("Forbidden: compliance holds are managed by the Harmonious team.");
  }
  return roles;
}

/**
 * Server-side guard other server functions call before doing anything that a
 * hold should stop. Throws with the client-visible explanation.
 */
export async function assertNoHold(
  supabase: any,
  scope: string,
  where: { offeringId?: string | null; clientId?: string | null; userId?: string | null },
) {
  const filters: string[] = [];
  if (where.offeringId) filters.push(`offering_id.eq.${where.offeringId}`);
  if (where.clientId) filters.push(`client_id.eq.${where.clientId}`);
  if (where.userId) filters.push(`subject_user_id.eq.${where.userId}`);
  if (!filters.length) return;

  const { data } = await supabase
    .from("compliance_holds")
    .select("scope, reason, client_explanation")
    .eq("status", "active")
    .in("scope", [scope, "service_delivery", "account_activity"])
    .or(filters.join(","));

  const hit = (data ?? [])[0];
  if (hit) {
    throw new Error(
      hit.client_explanation ||
        "This activity is on hold while Harmonious completes a compliance review. Your Harmonious contact can explain what's needed.",
    );
  }
}

export const listHolds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        offeringId: z.string().uuid().optional(),
        includeCleared: z.boolean().default(false),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const roles = await rolesOf(context);
    const isStaff = roles.some((r) => STAFF.includes(r));

    let query = context.supabase
      .from("compliance_holds")
      .select("*")
      .order("placed_at", { ascending: false });
    if (!data.includeCleared) query = query.eq("status", "active");
    if (data.offeringId) query = query.eq("offering_id", data.offeringId);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const [{ data: funds }, { data: clients }] = await Promise.all([
      context.supabase.from("offerings").select("id, name"),
      context.supabase.from("clients").select("id, name"),
    ]);

    return {
      isStaff,
      holds: (rows ?? []).map((h: any) => ({
        ...h,
        internal_note: isStaff ? h.internal_note : null,
        fundName: (funds ?? []).find((f: any) => f.id === h.offering_id)?.name ?? null,
        clientName: (clients ?? []).find((c: any) => c.id === h.client_id)?.name ?? null,
      })),
    };
  });

export const placeHold = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        clientId: z.string().uuid().nullable().optional(),
        offeringId: z.string().uuid().nullable().optional(),
        subjectUserId: z.string().uuid().nullable().optional(),
        scope: z.string().min(2).max(40),
        serviceKey: z.string().max(80).optional().or(z.literal("")),
        reason: z.string().min(2).max(60),
        internalNote: z.string().max(2000).optional().or(z.literal("")),
        clientExplanation: z.string().max(1000).optional().or(z.literal("")),
        remediation: z.string().max(1000).optional().or(z.literal("")),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const roles = await requireStaff(context);
    if (!data.clientId && !data.offeringId && !data.subjectUserId) {
      throw new Error("Choose a client, a fund or a person for this hold.");
    }
    const { data: created, error } = await context.supabase
      .from("compliance_holds")
      .insert({
        client_id: data.clientId ?? null,
        offering_id: data.offeringId ?? null,
        subject_user_id: data.subjectUserId ?? null,
        scope: data.scope,
        service_key: data.serviceKey || null,
        reason: data.reason,
        internal_note: data.internalNote || null,
        client_explanation: data.clientExplanation || null,
        remediation: data.remediation || null,
        placed_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await context.supabase.from("contract_audit_events").insert({
      actor_id: context.userId,
      actor_role: roles.join(", "),
      client_id: data.clientId ?? null,
      offering_id: data.offeringId ?? null,
      area: "compliance hold",
      action: "placed",
      target: `${data.scope} — ${data.reason}`,
      new_value: { scope: data.scope, reason: data.reason } as any,
      source: "web",
    });
    return { id: created.id as string };
  });

export const clearHold = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), note: z.string().max(1000).optional().or(z.literal("")) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const roles = await requireStaff(context);
    const { data: hold } = await context.supabase
      .from("compliance_holds")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!hold) throw new Error("That hold isn't available.");

    const { error } = await context.supabase
      .from("compliance_holds")
      .update({
        status: "cleared",
        cleared_by: context.userId,
        cleared_at: new Date().toISOString(),
        internal_note: data.note ? `${hold.internal_note ?? ""}\nCleared: ${data.note}`.trim() : hold.internal_note,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await context.supabase.from("contract_audit_events").insert({
      actor_id: context.userId,
      actor_role: roles.join(", "),
      client_id: hold.client_id,
      offering_id: hold.offering_id,
      area: "compliance hold",
      action: "cleared",
      target: `${hold.scope} — ${hold.reason}`,
      previous_value: { status: "active" } as any,
      new_value: { status: "cleared" } as any,
      source: "web",
    });
    return { ok: true };
  });
