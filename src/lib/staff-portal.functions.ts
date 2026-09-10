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

const CONTRACT_ROLES = [
  "admin",
  "super_admin",
  "legal",
  "client_success",
  "compliance",
  "finance",
  "executive",
] as const;

type Who = {
  userId: string;
  roles: string[];
  isStaff: boolean;
  canManage: boolean;
  isAdmin: boolean;
};

async function whoIs(context: any): Promise<Who> {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  const roles = ((data ?? []) as any[]).map((r) => String(r.role));
  return {
    userId: context.userId as string,
    roles,
    isStaff: roles.some((r) => (STAFF_ROLES as readonly string[]).includes(r)),
    canManage: roles.some((r) => (CONTRACT_ROLES as readonly string[]).includes(r)),
    isAdmin: roles.includes("admin") || roles.includes("super_admin"),
  };
}

async function requireStaff(context: any) {
  const who = await whoIs(context);
  if (!who.isStaff) throw new Error("Forbidden: this area is for the Harmonious team.");
  return who;
}

async function audit(
  context: any,
  who: Who,
  entry: {
    action: string;
    clientId?: string | null;
    target?: string | null;
    previous?: unknown;
    next?: unknown;
  },
) {
  await context.supabase.from("contract_audit_events").insert({
    actor_id: who.userId,
    actor_role: who.roles.join(", ") || null,
    client_id: entry.clientId ?? null,
    area: "client assignment",
    action: entry.action,
    target: entry.target ?? null,
    previous_value: (entry.previous ?? null) as any,
    new_value: (entry.next ?? null) as any,
  });
}

const OPEN_REQUEST_STATUSES = ["requested", "in_review"];

/** One Harmonious person's desk: the clients they cover and what is waiting on them. */
export const getMyDesk = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ showAll: z.boolean().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const who = await requireStaff(context);

    const { data: assignments, error: aErr } = await context.supabase
      .from("client_assignments")
      .select("client_id, staff_user_id, assignment_role, note");
    if (aErr) throw new Error(aErr.message);

    const mine = (assignments ?? []).filter((a: any) => a.staff_user_id === who.userId);
    const showAll = Boolean(data.showAll) && who.isAdmin;
    const myClientIds = mine.map((a: any) => String(a.client_id));

    const { data: allClients, error: cErr } = await context.supabase
      .from("clients")
      .select("id, name, legal_name, status, primary_contact_name, primary_contact_email")
      .order("name");
    if (cErr) throw new Error(cErr.message);

    const clients = (allClients ?? []).filter((c: any) =>
      showAll ? true : myClientIds.includes(String(c.id)),
    );
    const ids = clients.map((c: any) => String(c.id));

    const empty = {
      me: who.userId,
      roles: who.roles,
      canManage: who.canManage,
      isAdmin: who.isAdmin,
      showAll,
      unassignedCount: 0,
      clients: [] as any[],
      requests: [] as any[],
      quotes: [] as any[],
      holds: [] as any[],
      funds: [] as any[],
    };

    const assignedIds = new Set((assignments ?? []).map((a: any) => String(a.client_id)));
    const unassignedCount = (allClients ?? []).filter(
      (c: any) => !assignedIds.has(String(c.id)),
    ).length;

    if (ids.length === 0) return { ...empty, unassignedCount };

    const [reqRes, holdRes, fundRes, sowRes] = await Promise.all([
      context.supabase
        .from("service_requests")
        .select(
          "id, client_id, offering_id, service_key, status, requester_note, review_note, proposed_fee_cents, proposed_pricing_model, effective_date, created_at, updated_at",
        )
        .in("client_id", ids)
        .order("created_at", { ascending: true }),
      context.supabase
        .from("compliance_holds")
        .select(
          "id, client_id, offering_id, scope, service_key, reason, client_explanation, status, placed_at",
        )
        .in("client_id", ids)
        .eq("status", "open")
        .order("placed_at", { ascending: true }),
      context.supabase
        .from("offerings")
        .select("id, name, client_id, status, reg_type")
        .in("client_id", ids),
      context.supabase
        .from("client_sows")
        .select("id, client_id, title, status, effective_date, termination_date")
        .in("client_id", ids),
    ]);

    const requests = (reqRes.data ?? []) as any[];
    const funds = (fundRes.data ?? []) as any[];
    const sows = (sowRes.data ?? []) as any[];

    const fundName = (id: string | null) =>
      id ? (funds.find((f: any) => String(f.id) === String(id))?.name ?? null) : null;
    const clientName = (id: string) =>
      clients.find((c: any) => String(c.id) === String(id))?.name ?? "—";

    const decorate = (r: any) => ({
      ...r,
      clientName: clientName(r.client_id),
      fundName: fundName(r.offering_id),
    });

    return {
      me: who.userId,
      roles: who.roles,
      canManage: who.canManage,
      isAdmin: who.isAdmin,
      showAll,
      unassignedCount,
      clients: clients.map((c: any) => {
        const cid = String(c.id);
        const mineRow = mine.find((a: any) => String(a.client_id) === cid);
        const activeSow = sows.find(
          (s: any) => String(s.client_id) === cid && s.status === "active",
        );
        return {
          ...c,
          assignmentRole: mineRow?.assignment_role ?? null,
          fundCount: funds.filter((f: any) => String(f.client_id) === cid).length,
          openRequests: requests.filter(
            (r: any) =>
              String(r.client_id) === cid && OPEN_REQUEST_STATUSES.includes(String(r.status)),
          ).length,
          openQuotes: requests.filter(
            (r: any) => String(r.client_id) === cid && String(r.status) === "quoted",
          ).length,
          openHolds: (holdRes.data ?? []).filter((h: any) => String(h.client_id) === cid).length,
          activeSow: activeSow ? { id: activeSow.id, title: activeSow.title } : null,
        };
      }),
      requests: requests
        .filter((r: any) => OPEN_REQUEST_STATUSES.includes(String(r.status)))
        .map(decorate),
      quotes: requests
        .filter((r: any) => ["quoted", "signed"].includes(String(r.status)))
        .map(decorate),
      holds: ((holdRes.data ?? []) as any[]).map(decorate),
      funds: funds.map((f: any) => ({ ...f, clientName: clientName(f.client_id) })),
    };
  });

/** Every client with the Harmonious people covering them, for assignment. */
export const listClientCoverage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const who = await requireStaff(context);

    const [clientRes, assignRes, staffRes] = await Promise.all([
      context.supabase.from("clients").select("id, name, status").order("name"),
      context.supabase
        .from("client_assignments")
        .select("id, client_id, staff_user_id, assignment_role, note"),
      context.supabase.rpc("list_staff_accounts"),
    ]);

    const staff = ((staffRes.data ?? []) as any[]).map((s: any) => ({
      userId: String(s.user_id),
      name: s.legal_name || s.email,
      email: s.email,
    }));
    const nameOf = (id: string) =>
      staff.find((s) => s.userId === String(id))?.name ?? "Unknown teammate";

    return {
      me: who.userId,
      canManage: who.canManage,
      staff,
      clients: ((clientRes.data ?? []) as any[]).map((c: any) => ({
        ...c,
        assignees: ((assignRes.data ?? []) as any[])
          .filter((a: any) => String(a.client_id) === String(c.id))
          .map((a: any) => ({
            id: a.id,
            staffUserId: String(a.staff_user_id),
            name: nameOf(a.staff_user_id),
            role: a.assignment_role as "lead" | "support",
            note: a.note as string | null,
          })),
      })),
    };
  });

/** Put a Harmonious person on a client, or change whether they lead it. */
export const assignClientStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        clientId: z.string().uuid(),
        staffUserId: z.string().uuid(),
        assignmentRole: z.enum(["lead", "support"]),
        note: z.string().trim().max(400).optional().or(z.literal("")),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await whoIs(context);
    if (!who.canManage) {
      throw new Error("Only staff with contract authority can change client coverage.");
    }

    const { data: existing } = await context.supabase
      .from("client_assignments")
      .select("id, assignment_role, note")
      .eq("client_id", data.clientId)
      .eq("staff_user_id", data.staffUserId)
      .maybeSingle();

    const { error } = await context.supabase.from("client_assignments").upsert(
      {
        client_id: data.clientId,
        staff_user_id: data.staffUserId,
        assignment_role: data.assignmentRole,
        note: data.note || null,
        assigned_by: who.userId,
      },
      { onConflict: "client_id,staff_user_id" },
    );
    if (error) throw new Error(error.message);

    await audit(context, who, {
      action: existing ? "coverage changed" : "coverage added",
      clientId: data.clientId,
      target: data.staffUserId,
      previous: existing ?? null,
      next: { assignment_role: data.assignmentRole, note: data.note || null },
    });
    return { ok: true };
  });

/** Take a Harmonious person off a client. */
export const unassignClientStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const who = await whoIs(context);
    if (!who.canManage) {
      throw new Error("Only staff with contract authority can change client coverage.");
    }

    const { data: row } = await context.supabase
      .from("client_assignments")
      .select("id, client_id, staff_user_id, assignment_role")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("That coverage record is no longer there.");

    const { error } = await context.supabase
      .from("client_assignments")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await audit(context, who, {
      action: "coverage removed",
      clientId: String((row as any).client_id),
      target: String((row as any).staff_user_id),
      previous: row,
      next: null,
    });
    return { ok: true };
  });
