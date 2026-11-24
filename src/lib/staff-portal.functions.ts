import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/require-auth";
import { STAFF_ROLES as SHARED_STAFF_ROLES } from "@/lib/staff-roles";
import { TEAM_ROLES } from "@/lib/harmonious-team";

const STAFF_ROLES: readonly string[] = SHARED_STAFF_ROLES;

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


const OPEN_REQUEST_STATUSES = ["requested", "in_review"];

/** One Harmonious person's desk: the clients they cover and what is waiting on them. */
export const getMyDesk = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ showAll: z.boolean().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const who = await requireStaff(context);

    // One client staff list: Sales, Account Manager and Operations on the client team.
    const { clientStaffRows } = await import("@/lib/harmonious-team.server");
    const assignments = (await clientStaffRows()).map((a) => ({
      client_id: a.client_id,
      staff_user_id: a.user_id,
      assignment_role: a.team_role,
    }));

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

    const [reqRes, holdRes, fundRes, sowRes, contactRes, policyRes, invoiceRes] =
      await Promise.all([
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
      context.supabase
        .from("client_users")
        .select("id, client_id, user_id, client_role, created_at").is("revoked_at", null)
        .in("client_id", ids),
      context.supabase
        .from("policy_documents")
        .select("id, kind, title, version, published, effective_date")
        .eq("published", true),
      context.supabase
        .from("invoices")
        .select(
          "id, client_id, offering_id, number, status, total_cents, issue_date, due_date, paid_on, approval_status, client_payment_method, client_payment_reference, client_paid_on, client_payment_declared_at, created_at, updated_at",
        )
        .in("client_id", ids)
        .order("due_date", { ascending: true }),
      ]);

    const requests = (reqRes.data ?? []) as any[];
    const funds = (fundRes.data ?? []) as any[];
    const sows = (sowRes.data ?? []) as any[];
    const contacts = (contactRes.data ?? []) as any[];
    const policies = ((policyRes.data ?? []) as any[]).filter((p: any) => p.published);
    const invoicesAll = (invoiceRes.data ?? []) as any[];

    // Latest published version of each policy document - that is what people must sign.
    const latestPolicies = Array.from(
      policies
        .reduce((map: Map<string, any>, p: any) => {
          const current = map.get(String(p.kind));
          if (!current || Number(p.version) > Number(current.version)) map.set(String(p.kind), p);
          return map;
        }, new Map<string, any>())
        .values(),
    );

    const contactUserIds = Array.from(new Set(contacts.map((c: any) => String(c.user_id))));
    let acceptances: any[] = [];
    let profiles: any[] = [];
    if (contactUserIds.length > 0) {
      const [accRes, profRes] = await Promise.all([
        context.supabase
          .from("policy_acceptances")
          .select("user_id, kind, version, accepted_at")
          .in("user_id", contactUserIds),
        context.supabase
          .from("profiles")
          .select("user_id, legal_name, email")
          .in("user_id", contactUserIds),
      ]);
      acceptances = (accRes.data ?? []) as any[];
      profiles = (profRes.data ?? []) as any[];
    }


    const fundName = (id: string | null) =>
      id ? (funds.find((f: any) => String(f.id) === String(id))?.name ?? null) : null;
    const clientName = (id: string) =>
      clients.find((c: any) => String(c.id) === String(id))?.name ?? "-";

    const decorate = (r: any) => ({
      ...r,
      clientName: clientName(r.client_id),
      fundName: fundName(r.offering_id),
    });

    const personName = (userId: string) => {
      const p = profiles.find((x: any) => String(x.user_id) === String(userId));
      return p?.legal_name || p?.email || "A client contact";
    };
    const personEmail = (userId: string) =>
      profiles.find((x: any) => String(x.user_id) === String(userId))?.email ?? null;

    // One row per contact who still owes a signature on a published document.
    const signOffs: any[] = [];
    for (const contact of contacts) {
      const uid = String(contact.user_id);
      const outstanding = latestPolicies.filter(
        (p: any) =>
          !acceptances.some(
            (a: any) =>
              String(a.user_id) === uid &&
              String(a.kind) === String(p.kind) &&
              Number(a.version) === Number(p.version),
          ),
      );
      if (outstanding.length === 0) continue;
      signOffs.push({
        id: `${contact.client_id}-${uid}`,
        client_id: String(contact.client_id),
        clientName: clientName(String(contact.client_id)),
        userId: uid,
        personName: personName(uid),
        personEmail: personEmail(uid),
        clientRole: contact.client_role ?? null,
        since: contact.created_at ?? null,
        outstanding: outstanding.map((p: any) => ({
          kind: String(p.kind),
          title: p.title as string,
          version: Number(p.version),
        })),
      });
    }

    // Money waiting on someone: unpaid invoices, and payments a client says they sent.
    const openInvoices = invoicesAll
      .filter((i: any) => !["paid", "void", "draft"].includes(String(i.status)))
      .map(decorate);
    const declaredPayments = invoicesAll
      .filter((i: any) => i.client_payment_declared_at && String(i.status) !== "paid")
      .map(decorate);


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
          pendingSignOffs: signOffs.filter((s: any) => s.client_id === cid).length,
          openInvoices: openInvoices.filter((i: any) => String(i.client_id) === cid).length,
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
      signOffs,
      invoices: openInvoices,
      declaredPayments,
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
      import("@/lib/harmonious-team.server").then((m) => m.clientStaffRows()),
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
        assignees: assignRes
          .filter((a) => String(a.client_id) === String(c.id))
          .map((a) => ({
            id: `${a.client_id}|${a.team_role}`,
            staffUserId: String(a.user_id),
            name: nameOf(a.user_id),
            role: a.team_role,
            note: null as string | null,
          })),
      })),
    };
  });

/** Put a Harmonious person on a client team role. Saves to the one client team list. */
export const assignClientStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        clientId: z.string().uuid(),
        staffUserId: z.string().uuid(),
        assignmentRole: z.enum(TEAM_ROLES),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { changeClientTeamMember } = await import("@/lib/harmonious-team.server");
    await changeClientTeamMember(context.userId, data.clientId, data.assignmentRole, data.staffUserId);
    return { ok: true };
  });

/** Take a Harmonious person off a client team role. */
export const unassignClientStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().regex(/^[0-9a-f-]{36}\|(sales|account_manager|operations)$/) }).parse(d))
  .handler(async ({ data, context }) => {
    const [clientId, role] = data.id.split("|") as [string, (typeof TEAM_ROLES)[number]];
    const { changeClientTeamMember } = await import("@/lib/harmonious-team.server");
    await changeClientTeamMember(context.userId, clientId, role, null);
    return { ok: true };
  });
