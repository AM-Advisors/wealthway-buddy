// Everything a client is waiting on Harmonious to decide, gathered in one queue.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CONTRACT_ROLES, STAFF_ROLES } from "@/lib/contracts.functions";

async function whoIs(context: any) {
  const { data } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  const roles = ((data ?? []) as any[]).map((r) => String(r.role));
  return {
    userId: context.userId as string,
    roles,
    isStaff: roles.some((r) => (STAFF_ROLES as readonly string[]).includes(r)),
    canManage: roles.some((r) => (CONTRACT_ROLES as readonly string[]).includes(r)),
  };
}

export type SignoffItem = {
  kind: "service" | "wire" | "sow" | "invoice";
  id: string;
  title: string;
  detail: string;
  clientId: string | null;
  clientName: string | null;
  fundName: string | null;
  amountCents: number | null;
  raisedByName: string | null;
  raisedAt: string | null;
  /** Statement of work the service would be activated under, when there is one. */
  sowId?: string | null;
  sowTitle?: string | null;
  blocker?: string | null;
};

const OPEN_SERVICE = ["requested", "in_review", "quoted", "signed"];

/** The four queues: extra services, wire requests, agreements and invoice queries. */
export const listSignoffQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const who = await whoIs(context);
    if (!who.isStaff) throw new Error("Forbidden: this area is for the Harmonious team.");
    const { supabase } = context;

    const [
      { data: services },
      { data: wires },
      { data: sows },
      { data: invoices },
      { data: clients },
      { data: funds },
      { data: catalog },
    ] = await Promise.all([
      supabase
        .from("service_requests")
        .select("*")
        .in("status", OPEN_SERVICE)
        .order("created_at"),
      supabase
        .from("wire_requests")
        .select(
          "id, offering_id, amount_cents, purpose, note, expected_date, status, requested_by, created_at",
        )
        .eq("status", "pending")
        .order("created_at"),
      supabase
        .from("client_sows")
        .select(
          "id, client_id, offering_id, title, status, client_status, approval_status, signed_on, signed_by, signed_name, created_at",
        )
        .eq("approval_status", "pending")
        .order("created_at"),
      supabase
        .from("invoices")
        .select(
          "id, number, client_id, offering_id, total_cents, status, approval_status, dispute_reason, dispute_resolution, client_approved_by, updated_at, issue_date",
        )
        .eq("approval_status", "disputed")
        .is("dispute_resolution", null)
        .order("issue_date"),
      supabase.from("clients").select("id, name"),
      supabase.from("offerings").select("id, name, client_id"),
      supabase.from("service_catalog").select("key, name"),
    ]);

    const clientName = new Map(((clients ?? []) as any[]).map((c) => [c.id, c.name as string]));
    const fund = new Map(((funds ?? []) as any[]).map((f) => [f.id, f]));
    const serviceName = new Map(((catalog ?? []) as any[]).map((c) => [c.key, c.name as string]));

    const peopleIds = [
      ...new Set(
        [
          ...((services ?? []) as any[]).map((r) => r.requested_by),
          ...((wires ?? []) as any[]).map((w) => w.requested_by),
          ...((sows ?? []) as any[]).map((s) => s.signed_by),
          ...((invoices ?? []) as any[]).map((i) => i.client_approved_by),
        ].filter(Boolean),
      ),
    ];
    const { data: people } = peopleIds.length
      ? await supabase.from("profiles").select("user_id, legal_name, email").in("user_id", peopleIds)
      : { data: [] as any[] };
    const person = new Map(
      ((people ?? []) as any[]).map((p) => [
        p.user_id,
        (p.legal_name as string) || (p.email as string) || "Unknown",
      ]),
    );

    // Agreements a service could be activated under: signed and approved.
    const { data: liveSows } = await supabase
      .from("client_sows")
      .select("id, client_id, title, status, approval_status")
      .eq("approval_status", "approved")
      .order("created_at", { ascending: false });

    const serviceItems: SignoffItem[] = ((services ?? []) as any[]).map((r) => {
      const cover =
        ((liveSows ?? []) as any[]).find((s) => s.id === r.sow_id) ??
        ((liveSows ?? []) as any[]).find((s) => s.client_id === r.client_id);
      const blocker =
        r.status !== "signed"
          ? r.status === "quoted"
            ? "Waiting on the client to sign the amendment."
            : "Propose the fee and get the client's signature before this can be switched on."
          : !cover
            ? "No approved statement of work to activate this under."
            : null;
      return {
        kind: "service",
        id: r.id as string,
        title: serviceName.get(r.service_key) ?? String(r.service_key).replace(/_/g, " "),
        detail: (r.requester_note as string) || "No note from the client.",
        clientId: (r.client_id as string) ?? null,
        clientName: clientName.get(r.client_id) ?? null,
        fundName: r.offering_id ? ((fund.get(r.offering_id) as any)?.name ?? null) : null,
        amountCents: (r.proposed_fee_cents as number) ?? null,
        raisedByName: person.get(r.requested_by) ?? null,
        raisedAt: (r.created_at as string) ?? null,
        sowId: (cover as any)?.id ?? null,
        sowTitle: (cover as any)?.title ?? null,
        blocker,
      };
    });

    const wireItems: SignoffItem[] = ((wires ?? []) as any[]).map((w) => {
      const f = fund.get(w.offering_id) as any;
      return {
        kind: "wire",
        id: w.id as string,
        title: `${String(w.purpose ?? "wire").replace(/_/g, " ")} request`,
        detail: (w.note as string) || (w.expected_date ? `Expected ${w.expected_date}` : "No note."),
        clientId: f?.client_id ?? null,
        clientName: f?.client_id ? (clientName.get(f.client_id) ?? null) : null,
        fundName: f?.name ?? null,
        amountCents: (w.amount_cents as number) ?? null,
        raisedByName: person.get(w.requested_by) ?? null,
        raisedAt: (w.created_at as string) ?? null,
      };
    });

    const sowItems: SignoffItem[] = ((sows ?? []) as any[])
      .filter((s) => s.status !== "draft")
      .map((s) => ({
        kind: "sow",
        id: s.id as string,
        title: (s.title as string) ?? "Statement of work",
        detail:
          s.client_status === "signed"
            ? `Signed by ${s.signed_name ?? person.get(s.signed_by) ?? "the client"}${s.signed_on ? ` on ${s.signed_on}` : ""}.`
            : s.client_status === "sent_back"
              ? "The client sent this back for changes."
              : "The client has not signed this yet.",
        clientId: (s.client_id as string) ?? null,
        clientName: clientName.get(s.client_id) ?? null,
        fundName: s.offering_id ? ((fund.get(s.offering_id) as any)?.name ?? null) : null,
        amountCents: null,
        raisedByName: person.get(s.signed_by) ?? null,
        raisedAt: (s.signed_on as string) ?? (s.created_at as string) ?? null,
        blocker: s.client_status === "signed" ? null : "Nothing to approve until the client signs.",
      }));

    const invoiceItems: SignoffItem[] = ((invoices ?? []) as any[]).map((i) => ({
      kind: "invoice",
      id: i.id as string,
      title: `Invoice ${i.number ?? ""}`.trim(),
      detail: (i.dispute_reason as string) || "The client queried this invoice.",
      clientId: (i.client_id as string) ?? null,
      clientName: clientName.get(i.client_id) ?? null,
      fundName: i.offering_id ? ((fund.get(i.offering_id) as any)?.name ?? null) : null,
      amountCents: (i.total_cents as number) ?? null,
      raisedByName: person.get(i.client_approved_by) ?? null,
      raisedAt: (i.updated_at as string) ?? null,
    }));

    return {
      canManage: who.canManage,
      services: serviceItems,
      wires: wireItems,
      sows: sowItems,
      invoices: invoiceItems,
    };
  });

/** Harmonious decides an invoice query: accept it and pull the invoice back for
 *  correction, or keep the invoice as it stands and re-ask the client. */
export const resolveInvoiceQuery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        decision: z.enum(["accepted", "declined"]),
        note: z.string().trim().max(2000).optional().or(z.literal("")),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await whoIs(context);
    if (!who.canManage) {
      throw new Error(
        "Forbidden: deciding an invoice query needs legal, compliance, finance, client success or admin authority.",
      );
    }
    if (data.decision === "declined" && !data.note) {
      throw new Error("Give the client a reason for keeping the invoice as it stands.");
    }

    const { data: invoice } = await context.supabase
      .from("invoices")
      .select("id, number, client_id, offering_id, status, approval_status")
      .eq("id", data.id)
      .maybeSingle();
    if (!invoice) throw new Error("That invoice isn't available.");
    const inv = invoice as any;
    if (inv.approval_status !== "disputed") throw new Error("There is no open query on this invoice.");

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      dispute_resolution: data.decision,
      dispute_resolution_note: data.note || null,
      dispute_resolved_at: now,
      dispute_resolved_by: who.userId,
    };
    if (data.decision === "accepted") {
      // Pull it back so the team can correct and re-issue it.
      patch["status"] = "draft";
      patch["approval_status"] = "pending";
      patch["approval_requested_at"] = null;
    } else {
      patch["approval_status"] = "pending";
      patch["approval_requested_at"] = now;
      patch["dispute_reason"] = null;
    }

    const { error } = await context.supabase.from("invoices").update(patch as any).eq("id", data.id);
    if (error) throw new Error(error.message);

    await context.supabase.from("contract_audit_events").insert({
      actor_id: who.userId,
      actor_role: who.roles.join(", ") || null,
      client_id: inv.client_id ?? null,
      offering_id: inv.offering_id ?? null,
      area: "invoice",
      action: `query ${data.decision}`,
      target: inv.number ?? inv.id,
      previous_value: { approval_status: inv.approval_status, status: inv.status } as any,
      new_value: { decision: data.decision, note: data.note || null } as any,
      approval: data.decision,
      source: "web",
    });

    return { ok: true };
  });
