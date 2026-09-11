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

export type ActivityCategory =
  | "Fund setup"
  | "Document signing"
  | "Invoice approvals"
  | "Payments"
  | "Service requests";

export type ActivityEvent = {
  id: string;
  at: string;
  clientId: string | null;
  clientName: string;
  category: ActivityCategory;
  summary: string;
  detail: string | null;
  person: string | null;
  fundName: string | null;
  amountCents: number | null;
};

async function requireStaff(context: any) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  const roles = ((data ?? []) as any[]).map((r) => String(r.role));
  if (!roles.some((r) => (STAFF_ROLES as readonly string[]).includes(r))) {
    throw new Error("Forbidden: client portal activity is for the Harmonious team.");
  }
  return roles;
}

const money = (cents: number | null | undefined) =>
  cents === null || cents === undefined
    ? null
    : (Number(cents) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

/**
 * Everything the client side of the portal has done: fund setup details,
 * documents signed, invoices approved or queried, payments declared and
 * service requests raised. Read-only — this is a record, not a control.
 */
export const getClientPortalActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        days: z.number().int().min(1).max(3650).nullable().optional(),
        clientId: z.string().uuid().nullable().optional(),
        limit: z.number().int().min(20).max(1000).default(400),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const since = data.days ? new Date(Date.now() - data.days * 86_400_000).toISOString() : null;

    const [
      { data: clients },
      { data: offerings },
      { data: people },
      { data: members },
      { data: intakes },
      { data: sows },
      { data: invoices },
      { data: requests },
      { data: acceptances },
      { data: policies },
      { data: wires },
    ] = await Promise.all([
      context.supabase.from("clients").select("id, name, legal_name").order("name"),
      context.supabase.from("offerings").select("id, name, client_id"),
      context.supabase.from("profiles").select("user_id, legal_name, email"),
      context.supabase.from("client_users").select("client_id, user_id, client_role"),
      context.supabase
        .from("client_fund_intakes")
        .select("id, client_id, offering_id, status, created_at, submitted_at, submitted_by"),
      context.supabase
        .from("client_sows")
        .select(
          "id, client_id, title, client_signature_name, client_signed_at, client_signed_user_id, client_status, client_sent_back_at, client_sent_back_reason",
        ),
      context.supabase
        .from("invoices")
        .select(
          "id, client_id, number, total_cents, approval_status, client_approved_at, client_approved_by, client_signer_name, dispute_reason, client_payment_method, client_payment_reference, client_paid_on, client_payment_declared_at, client_payment_declared_by, paid_on",
        ),
      context.supabase
        .from("service_requests")
        .select(
          "id, client_id, offering_id, service_key, status, created_at, requested_by, client_approved_at, client_approved_by, signer_name",
        ),
      context.supabase
        .from("policy_acceptances")
        .select("id, user_id, kind, version, signer_name, accepted_at, document_id"),
      context.supabase.from("policy_documents").select("id, title, kind"),
      context.supabase
        .from("wire_requests")
        .select("id, offering_id, amount_cents, purpose, status, created_at, requested_by"),
    ]);

    const clientRows = (clients ?? []) as any[];
    const clientName = new Map<string, string>(
      clientRows.map((c) => [String(c.id), String(c.legal_name || c.name || "Client")]),
    );
    const fundName = new Map<string, string>(
      ((offerings ?? []) as any[]).map((o) => [String(o.id), String(o.name ?? "Fund")]),
    );
    const fundClient = new Map<string, string | null>(
      ((offerings ?? []) as any[]).map((o) => [String(o.id), o.client_id ? String(o.client_id) : null]),
    );
    const personName = new Map<string, string>(
      ((people ?? []) as any[]).map((p) => [
        String(p.user_id),
        String(p.legal_name || p.email || "Portal user"),
      ]),
    );
    const userClient = new Map<string, string>();
    for (const m of (members ?? []) as any[]) {
      if (!userClient.has(String(m.user_id))) userClient.set(String(m.user_id), String(m.client_id));
    }
    const policyTitle = new Map<string, string>(
      ((policies ?? []) as any[]).map((p) => [String(p.id), String(p.title ?? p.kind ?? "Document")]),
    );

    const events: ActivityEvent[] = [];
    const push = (
      at: string | null | undefined,
      clientId: string | null,
      category: ActivityCategory,
      summary: string,
      extra: Partial<ActivityEvent> = {},
    ) => {
      if (!at) return;
      const id = `${category}:${summary}:${at}:${clientId ?? "none"}`;
      events.push({
        id,
        at: new Date(at).toISOString(),
        clientId,
        clientName: clientId ? (clientName.get(clientId) ?? "Client") : "Unlinked",
        category,
        summary,
        detail: null,
        person: null,
        fundName: null,
        amountCents: null,
        ...extra,
      });
    };

    for (const row of (intakes ?? []) as any[]) {
      const cid = row.client_id ? String(row.client_id) : null;
      const fund = row.offering_id ? (fundName.get(String(row.offering_id)) ?? null) : null;
      push(row.created_at, cid, "Fund setup", "Fund details started", {
        detail: "The client opened their fund intake form in the portal.",
        fundName: fund,
      });
      push(row.submitted_at, cid, "Fund setup", "Fund details submitted", {
        detail: `Status: ${String(row.status ?? "submitted")}.`,
        person: row.submitted_by ? (personName.get(String(row.submitted_by)) ?? null) : null,
        fundName: fund,
      });
    }

    for (const row of (sows ?? []) as any[]) {
      const cid = row.client_id ? String(row.client_id) : null;
      push(row.client_signed_at, cid, "Document signing", `Agreement signed: ${row.title}`, {
        detail: row.client_signature_name ? `Signed by ${row.client_signature_name}.` : null,
        person: row.client_signed_user_id
          ? (personName.get(String(row.client_signed_user_id)) ?? null)
          : null,
      });
      push(row.client_sent_back_at, cid, "Document signing", `Agreement sent back: ${row.title}`, {
        detail: row.client_sent_back_reason ? String(row.client_sent_back_reason) : null,
      });
    }

    for (const row of (acceptances ?? []) as any[]) {
      const cid = userClient.get(String(row.user_id)) ?? null;
      const title = row.document_id
        ? (policyTitle.get(String(row.document_id)) ?? String(row.kind ?? "Policy"))
        : String(row.kind ?? "Policy");
      push(row.accepted_at, cid, "Document signing", `Sign-off accepted: ${title}`, {
        detail: `Version ${row.version ?? "—"}${row.signer_name ? `, typed name ${row.signer_name}` : ""}.`,
        person: personName.get(String(row.user_id)) ?? null,
      });
    }

    for (const row of (invoices ?? []) as any[]) {
      const cid = row.client_id ? String(row.client_id) : null;
      const number = row.number ?? "Draft invoice";
      const decision = String(row.approval_status ?? "");
      push(
        row.client_approved_at,
        cid,
        "Invoice approvals",
        decision === "disputed"
          ? `Invoice queried: ${number}`
          : `Invoice approved: ${number}`,
        {
          detail:
            decision === "disputed"
              ? (row.dispute_reason ?? "The client raised a query on this invoice.")
              : row.client_signer_name
                ? `Approved by ${row.client_signer_name}.`
                : null,
          person: row.client_approved_by
            ? (personName.get(String(row.client_approved_by)) ?? null)
            : null,
          amountCents: row.total_cents ?? null,
        },
      );
      push(row.client_payment_declared_at, cid, "Payments", `Payment reported: ${number}`, {
        detail: `${String(row.client_payment_method ?? "transfer").toUpperCase()}${
          row.client_payment_reference ? ` · reference ${row.client_payment_reference}` : ""
        }${row.client_paid_on ? ` · sent ${row.client_paid_on}` : ""}${
          row.paid_on ? " · matched by Harmonious" : " · awaiting match"
        }`,
        person: row.client_payment_declared_by
          ? (personName.get(String(row.client_payment_declared_by)) ?? null)
          : null,
        amountCents: row.total_cents ?? null,
      });
    }

    for (const row of (requests ?? []) as any[]) {
      const cid = row.client_id ? String(row.client_id) : null;
      const fund = row.offering_id ? (fundName.get(String(row.offering_id)) ?? null) : null;
      push(row.created_at, cid, "Service requests", `Service requested: ${row.service_key}`, {
        detail: `Status: ${String(row.status ?? "requested")}.`,
        person: row.requested_by ? (personName.get(String(row.requested_by)) ?? null) : null,
        fundName: fund,
      });
      push(row.client_approved_at, cid, "Service requests", `Quote signed: ${row.service_key}`, {
        detail: row.signer_name ? `Signed by ${row.signer_name}.` : null,
        person: row.client_approved_by
          ? (personName.get(String(row.client_approved_by)) ?? null)
          : null,
        fundName: fund,
      });
    }

    for (const row of (wires ?? []) as any[]) {
      const cid = row.offering_id ? (fundClient.get(String(row.offering_id)) ?? null) : null;
      push(row.created_at, cid, "Payments", `Wire requested: ${money(row.amount_cents) ?? ""}`, {
        detail: `${row.purpose ?? "Transfer"} · status ${String(row.status ?? "requested")}.`,
        person: row.requested_by ? (personName.get(String(row.requested_by)) ?? null) : null,
        fundName: row.offering_id ? (fundName.get(String(row.offering_id)) ?? null) : null,
        amountCents: row.amount_cents ?? null,
      });
    }

    const filtered = events
      .filter((e) => (since ? e.at >= since : true))
      .filter((e) => (data.clientId ? e.clientId === data.clientId : true))
      .sort((a, b) => (a.at < b.at ? 1 : -1))
      .slice(0, data.limit);

    return {
      events: filtered,
      clients: clientRows.map((c) => ({
        id: String(c.id),
        name: String(c.legal_name || c.name || "Client"),
      })),
      total: filtered.length,
    };
  });
