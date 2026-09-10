import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const STAFF_ROLES = [
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
] as const;

/** One row in the audit trail, whatever it came from. */
export type AuditEntry = {
  id: string;
  at: string;
  actor: string | null;
  fundName: string | null;
  category: string;
  summary: string;
  detail: string | null;
  amountCents: number | null;
  status: string | null;
};

const filterSchema = z.object({
  days: z.number().int().min(1).max(3650).nullable().optional(),
  offeringId: z.string().uuid().nullable().optional(),
  search: z.string().trim().max(160).optional(),
  limit: z.number().int().min(10).max(500).default(200),
});

type Filters = z.infer<typeof filterSchema>;

async function requireStaff(context: any) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  const roles = ((data ?? []) as any[]).map((r) => String(r.role));
  if (!roles.some((r) => (STAFF_ROLES as readonly string[]).includes(r))) {
    throw new Error("Forbidden: the audit log is for the Harmonious team.");
  }
  return roles;
}

const sinceOf = (days: number | null | undefined) =>
  days ? new Date(Date.now() - days * 86_400_000).toISOString() : null;

/** Lookup tables shared by every tab: fund names, people, applications. */
async function lookups(context: any) {
  const [{ data: funds }, { data: people }, { data: apps }, { data: clients }] = await Promise.all([
    context.supabase.from("offerings").select("id, name"),
    context.supabase.from("profiles").select("user_id, legal_name, email"),
    context.supabase.from("investor_applications").select("id, offering_id, user_id"),
    context.supabase.from("clients").select("id, name"),
  ]);
  const fundName = new Map<string, string>((funds ?? []).map((f: any) => [f.id, f.name]));
  const clientName = new Map<string, string>((clients ?? []).map((c: any) => [c.id, c.name]));
  const personName = new Map<string, string>(
    (people ?? []).map((p: any) => [p.user_id, p.legal_name || p.email || "Unknown"]),
  );
  const app = new Map<string, { offering_id: string | null; user_id: string | null }>(
    (apps ?? []).map((a: any) => [a.id, { offering_id: a.offering_id, user_id: a.user_id }]),
  );
  return { fundName, clientName, personName, app };
}

const money = (cents: number | null | undefined) =>
  cents === null || cents === undefined
    ? null
    : (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

const mask = (value: string | null | undefined) => {
  const v = String(value ?? "").replace(/\s/g, "");
  return v.length > 4 ? `•••• ${v.slice(-4)}` : v || null;
};

const dateOnly = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString("en-US", { dateStyle: "medium" }) : null;

const joinDetail = (parts: (string | null | undefined)[]) =>
  parts.filter(Boolean).join(" · ") || null;

/** Trim, sort newest first and apply the free-text search. */
function finish(rows: AuditEntry[], filters: Filters): { entries: AuditEntry[] } {
  const needle = (filters.search ?? "").toLowerCase().trim();
  let out = rows;
  if (needle) {
    out = out.filter((r) =>
      [r.actor, r.fundName, r.category, r.summary, r.detail, r.status]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle)),
    );
  }
  out = out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, filters.limit);
  return { entries: out };
}

/* ---------------------------------------------------------- money movement */

export const listMoneyAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => filterSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const since = sinceOf(data.days);
    const { fundName, personName, app, clientName } = await lookups(context);

    const range = (q: any) => (since ? q.gte("created_at", since) : q);

    const [requests, confirmations, instructions, approvals, payments] = await Promise.all([
      range(context.supabase.from("wire_requests").select("*")).limit(500),
      range(context.supabase.from("wire_confirmations").select("*")).limit(500),
      range(context.supabase.from("payment_instructions").select("*")).limit(500),
      range(context.supabase.from("payment_approvals").select("*")).limit(500),
      range(context.supabase.from("payments").select("*")).limit(500),
    ]);

    const instructionFund = new Map<string, string | null>(
      ((instructions.data ?? []) as any[]).map((i) => [i.id, i.offering_id ?? null]),
    );

    const rows: AuditEntry[] = [];

    for (const r of (requests.data ?? []) as any[]) {
      const fund = r.offering_id ?? app.get(r.application_id)?.offering_id ?? null;
      rows.push({
        id: `wire-request-${r.id}`,
        at: r.updated_at ?? r.created_at,
        actor: personName.get(r.reviewed_by ?? r.requested_by) ?? null,
        fundName: fund ? (fundName.get(fund) ?? null) : null,
        category: "Wire request",
        summary: `Wire request ${r.purpose ? `for ${r.purpose}` : ""}`.trim(),
        detail: joinDetail([
          r.expected_date ? `Expected ${dateOnly(r.expected_date)}` : null,
          r.note,
          r.review_note ? `Review: ${r.review_note}` : null,
          r.reviewed_at ? `Reviewed ${dateOnly(r.reviewed_at)}` : null,
        ]),
        amountCents: r.amount_cents ?? null,
        status: r.status ?? null,
      });
    }

    for (const c of (confirmations.data ?? []) as any[]) {
      const fund = app.get(c.application_id)?.offering_id ?? null;
      const investor = app.get(c.application_id)?.user_id ?? null;
      rows.push({
        id: `wire-confirmation-${c.id}`,
        at: c.updated_at ?? c.created_at,
        actor: personName.get(c.reviewed_by ?? investor ?? "") ?? null,
        fundName: fund ? (fundName.get(fund) ?? null) : null,
        category: "Wire confirmation",
        summary: `Investor wire confirmation${c.bank_reference ? ` ref ${c.bank_reference}` : ""}`,
        detail: joinDetail([
          c.sending_bank_name,
          c.sending_account_last4 ? `Account •••• ${c.sending_account_last4}` : null,
          c.sent_on ? `Sent ${dateOnly(c.sent_on)}` : null,
          c.investor_note,
          c.review_notes ? `Review: ${c.review_notes}` : null,
        ]),
        amountCents: c.amount_cents ?? null,
        status: c.status ?? null,
      });
    }

    for (const i of (instructions.data ?? []) as any[]) {
      rows.push({
        id: `payment-instruction-${i.id}`,
        at: i.updated_at ?? i.created_at,
        actor: personName.get(i.requested_by) ?? null,
        fundName: i.offering_id
          ? (fundName.get(i.offering_id) ?? null)
          : i.client_id
            ? (clientName.get(i.client_id) ?? null)
            : null,
        category: "Payment instruction",
        summary: `${i.direction ?? "payment"} — ${i.purpose ?? "instruction"}`,
        detail: joinDetail([
          i.beneficiary_name ? `To ${i.beneficiary_name}` : null,
          i.beneficiary_account ? `Account ${mask(i.beneficiary_account)}` : null,
          i.dual_approval_required ? "Dual approval required" : null,
          i.verification_status ? `Verification: ${i.verification_status}` : null,
          i.callback_status ? `Callback: ${i.callback_status}` : null,
          i.compliance_status ? `Compliance: ${i.compliance_status}` : null,
          i.bank_status ? `Bank: ${i.bank_status}` : null,
          i.pause_reason ? `Paused: ${i.pause_reason}` : null,
          i.note,
        ]),
        amountCents: i.amount_cents ?? null,
        status: i.status ?? null,
      });
    }

    for (const a of (approvals.data ?? []) as any[]) {
      const fund = instructionFund.get(a.instruction_id) ?? null;
      rows.push({
        id: `payment-approval-${a.id}`,
        at: a.created_at,
        actor: personName.get(a.approver_id) ?? null,
        fundName: fund ? (fundName.get(fund) ?? null) : null,
        category: "Payment approval",
        summary: `Instruction ${a.decision ?? "reviewed"}`,
        detail: joinDetail([a.approver_role ? `As ${a.approver_role}` : null, a.note]),
        amountCents: null,
        status: a.decision ?? null,
      });
    }

    for (const p of (payments.data ?? []) as any[]) {
      const fund = app.get(p.application_id)?.offering_id ?? null;
      const investor = app.get(p.application_id)?.user_id ?? null;
      rows.push({
        id: `payment-${p.id}`,
        at: p.updated_at ?? p.created_at,
        actor: personName.get(investor ?? "") ?? null,
        fundName: fund ? (fundName.get(fund) ?? null) : null,
        category: "Investor payment",
        summary: `${p.method === "ach" ? "ACH" : "Wire"} payment${p.reference_code ? ` ref ${p.reference_code}` : ""}`,
        detail: joinDetail([
          p.provider ? `Provider ${p.provider}` : null,
          p.bank_last4 ? `Account •••• ${p.bank_last4}` : null,
          p.expected_date ? `Expected ${dateOnly(p.expected_date)}` : null,
          p.confirmed_at ? `Confirmed ${dateOnly(p.confirmed_at)}` : null,
          p.failure_reason,
        ]),
        amountCents: p.amount_cents ?? null,
        status: p.status ?? null,
      });
    }

    const filtered = data.offeringId
      ? rows.filter((r) => r.fundName === fundName.get(data.offeringId as string))
      : rows;
    return finish(filtered, data);
  });

/* ------------------------------------------------------------ distributions */

export const listDistributionAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => filterSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const since = sinceOf(data.days);
    const { fundName, personName } = await lookups(context);

    let query = context.supabase.from("fund_distributions").select("*").limit(500);
    if (since) query = query.gte("created_at", since);
    if (data.offeringId) query = query.eq("offering_id", data.offeringId);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const entries: AuditEntry[] = ((rows ?? []) as any[]).map((d) => ({
      id: `distribution-${d.id}`,
      at: d.updated_at ?? d.created_at,
      actor: personName.get(d.created_by) ?? null,
      fundName: d.offering_id ? (fundName.get(d.offering_id) ?? null) : null,
      category: "Distribution",
      summary: `${d.kind ?? "Distribution"} paid ${dateOnly(d.paid_on) ?? ""}`.trim(),
      detail: d.note ?? null,
      amountCents: d.amount_cents ?? null,
      status: null,
    }));
    return finish(entries, data);
  });

/* ----------------------------------------------------------- investor checks */

export const listInvestorCheckAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => filterSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const since = sinceOf(data.days);
    const { fundName, personName, app } = await lookups(context);
    const range = (q: any) => (since ? q.gte("created_at", since) : q);

    const [kyc, aml, accreditation] = await Promise.all([
      range(context.supabase.from("kyc_verifications").select("*")).limit(500),
      range(context.supabase.from("aml_screenings").select("*")).limit(500),
      range(context.supabase.from("accreditation_records").select("*")).limit(500),
    ]);

    const who = (applicationId: string) => {
      const a = app.get(applicationId);
      return {
        fund: a?.offering_id ? (fundName.get(a.offering_id) ?? null) : null,
        person: a?.user_id ? (personName.get(a.user_id) ?? null) : null,
      };
    };

    const rows: AuditEntry[] = [];

    for (const k of (kyc.data ?? []) as any[]) {
      const w = who(k.application_id);
      rows.push({
        id: `kyc-${k.id}`,
        at: k.updated_at ?? k.created_at,
        actor: w.person,
        fundName: w.fund,
        category: "Identity verification",
        summary: `Identity check with ${k.provider ?? "provider"}`,
        detail: joinDetail([
          k.decision ? `Provider decision: ${k.decision}` : null,
          k.result ? `Result: ${typeof k.result === "string" ? k.result : "recorded"}` : null,
          k.completed_at ? `Completed ${dateOnly(k.completed_at)}` : null,
          k.expired_at ? `Expires ${dateOnly(k.expired_at)}` : null,
        ]),
        amountCents: null,
        status: k.status ?? null,
      });
    }

    for (const a of (aml.data ?? []) as any[]) {
      const w = who(a.application_id);
      const matches = Array.isArray(a.matches) ? a.matches.length : a.matches ? 1 : 0;
      rows.push({
        id: `aml-${a.id}`,
        at: a.updated_at ?? a.created_at,
        actor: w.person,
        fundName: w.fund,
        category: "Screening",
        summary: `Screening with ${a.provider ?? "provider"}`,
        detail: joinDetail([
          `${matches} potential match${matches === 1 ? "" : "es"} returned by the provider`,
          a.completed_at ? `Completed ${dateOnly(a.completed_at)}` : null,
        ]),
        amountCents: null,
        status: a.status ?? null,
      });
    }

    for (const r of (accreditation.data ?? []) as any[]) {
      const w = who(r.application_id);
      rows.push({
        id: `accreditation-${r.id}`,
        at: r.updated_at ?? r.created_at,
        actor: w.person,
        fundName: w.fund,
        category: "Accreditation",
        summary: `Accreditation record (${r.reg_type ?? "—"}, ${r.method ?? "—"})`,
        detail: joinDetail([
          r.qualifies === null || r.qualifies === undefined
            ? null
            : `Recorded as ${r.qualifies ? "qualifying" : "not qualifying"}`,
          r.pre_existing_relationship ? "Pre-existing relationship recorded" : null,
          r.attested_at ? `Attested ${dateOnly(r.attested_at)}` : null,
          r.verified_at ? `Verified ${dateOnly(r.verified_at)}` : null,
          r.expires_at ? `Expires ${dateOnly(r.expires_at)}` : null,
          r.reviewer_id ? `Reviewed by ${personName.get(r.reviewer_id) ?? "staff"}` : null,
          r.review_notes,
        ]),
        amountCents: null,
        status: r.status ?? null,
      });
    }

    const filtered = data.offeringId
      ? rows.filter((r) => r.fundName === fundName.get(data.offeringId as string))
      : rows;
    return finish(filtered, data);
  });

/* ------------------------------------------------------------------ filings */

export const listFilingAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => filterSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const since = sinceOf(data.days);
    const { fundName, personName } = await lookups(context);

    let query = context.supabase.from("fund_compliance_items").select("*").limit(500);
    if (since) query = query.gte("created_at", since);
    if (data.offeringId) query = query.eq("offering_id", data.offeringId);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const entries: AuditEntry[] = ((rows ?? []) as any[]).map((f) => ({
      id: `filing-${f.id}`,
      at: f.updated_at ?? f.created_at,
      actor: f.owner_name ?? personName.get(f.created_by) ?? null,
      fundName: f.offering_id ? (fundName.get(f.offering_id) ?? null) : null,
      category: f.category ? `Filing — ${f.category}` : "Filing",
      summary: f.label ?? f.key ?? "Compliance item",
      detail: joinDetail([
        f.due_date ? `Due ${dateOnly(f.due_date)}` : null,
        f.filed_on ? `Filed ${dateOnly(f.filed_on)}` : null,
        f.reference ? `Reference ${f.reference}` : null,
        f.note,
      ]),
      amountCents: null,
      status: f.status ?? null,
    }));
    return finish(entries, data);
  });

/* -------------------------------------------------------------------- holds */

export const listHoldAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => filterSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const since = sinceOf(data.days);
    const { fundName, clientName, personName } = await lookups(context);

    let query = context.supabase.from("compliance_holds").select("*").limit(500);
    if (since) query = query.gte("created_at", since);
    if (data.offeringId) query = query.eq("offering_id", data.offeringId);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const entries: AuditEntry[] = ((rows ?? []) as any[]).map((h) => ({
      id: `hold-${h.id}`,
      at: h.updated_at ?? h.created_at,
      actor: personName.get(h.cleared_by ?? h.placed_by) ?? null,
      fundName: h.offering_id
        ? (fundName.get(h.offering_id) ?? null)
        : h.client_id
          ? (clientName.get(h.client_id) ?? null)
          : null,
      category: "Compliance hold",
      summary: `${String(h.scope ?? "").replace(/_/g, " ")} paused — ${String(h.reason ?? "").replace(/_/g, " ")}`,
      detail: joinDetail([
        h.placed_at ? `Placed ${dateOnly(h.placed_at)}` : null,
        h.cleared_at ? `Cleared ${dateOnly(h.cleared_at)}` : null,
        h.remediation ? `Resolves with: ${h.remediation}` : null,
        h.client_explanation ? `Client sees: ${h.client_explanation}` : null,
        h.internal_note ? `Internal: ${h.internal_note}` : null,
      ]),
      amountCents: null,
      status: h.status ?? null,
    }));
    return finish(entries, data);
  });

/* --------------------------------------------------------------- scope/fees */

export const listScopeAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => filterSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const since = sinceOf(data.days);
    const { fundName, clientName, personName } = await lookups(context);

    let query = context.supabase.from("contract_audit_events").select("*").limit(500);
    if (since) query = query.gte("created_at", since);
    if (data.offeringId) query = query.eq("offering_id", data.offeringId);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const short = (v: unknown) => {
      if (v === null || v === undefined) return null;
      const text = typeof v === "string" ? v : JSON.stringify(v);
      return text.length > 180 ? `${text.slice(0, 180)}…` : text;
    };

    const entries: AuditEntry[] = ((rows ?? []) as any[]).map((e) => ({
      id: `scope-${e.id}`,
      at: e.created_at,
      actor: personName.get(e.actor_id) ?? null,
      fundName: e.offering_id
        ? (fundName.get(e.offering_id) ?? null)
        : e.client_id
          ? (clientName.get(e.client_id) ?? null)
          : null,
      category: e.area ? `Scope — ${e.area}` : "Scope",
      summary: `${e.action ?? "changed"}${e.target ? ` — ${e.target}` : ""}`,
      detail: joinDetail([
        e.actor_role ? `As ${e.actor_role}` : null,
        e.approval ? `Approval: ${e.approval}` : null,
        e.previous_value ? `Before: ${short(e.previous_value)}` : null,
        e.new_value ? `After: ${short(e.new_value)}` : null,
        e.source ? `Source: ${e.source}` : null,
      ]),
      amountCents: null,
      status: null,
    }));
    return finish(entries, data);
  });

/** Funds staff can filter the trail by. */
export const listAuditFunds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStaff(context);
    const { data, error } = await context.supabase.from("offerings").select("id, name").order("name");
    if (error) throw new Error(error.message);
    return { funds: (data ?? []) as { id: string; name: string }[] };
  });

export const formatAuditAmount = money;
