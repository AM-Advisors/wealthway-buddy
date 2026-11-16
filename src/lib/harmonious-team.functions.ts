import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";
import { TEAM_ROLES, canManageRole, fundAdministrator, clientFacingContacts, eligibleFor, teamFollowUp, type TeamRole } from "@/lib/harmonious-team";
import { staffProfile } from "@/lib/harmonious-staff";

const uuid = z.string().uuid();
const role = z.enum(TEAM_ROLES);
const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;

async function requireStaff(context: any) {
  const { rolesFor } = await import("@/lib/harmonious-team.server");
  const roles = await rolesFor(context.userId);
  if (!staffProfile(roles).isHarmoniousStaff) throw new Error("Forbidden.");
  return roles;
}

async function names(ids: (string | null)[]) {
  const list = [...new Set(ids.filter(Boolean))] as string[];
  if (!list.length) return new Map<string, string>();
  const { data } = await (await admin()).from("profiles").select("user_id, legal_name, email").in("user_id", list);
  return new Map(((data ?? []) as any[]).map((p) => [p.user_id, p.legal_name || p.email || "Staff member"]));
}

async function history(filter: { client_id?: string; offering_id?: string }) {
  let q = (await admin()).from("team_assignment_events").select("*").order("created_at", { ascending: false }).limit(25);
  q = filter.client_id ? q.eq("client_id", filter.client_id) : q.eq("offering_id", filter.offering_id);
  const { data } = await q;
  return (data ?? []) as any[];
}

/** Internal team view for a Client. Staff only. Funds inherit the Client team. */
export const getHarmoniousTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ clientId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const roles = await requireStaff(context);
    const srv = await import("@/lib/harmonious-team.server");
    const team = (await import("@/lib/harmonious-team")).resolveTeam({ hasClient: true, client: await srv.loadClientTeam(data.clientId) });
    const events = await history({ client_id: data.clientId });
    const sc = await setupScope({ clientId: data.clientId });
    const n = await names([...team.map((m) => m.userId), ...events.flatMap((e) => [e.prior_user_id, e.new_user_id, e.changed_by])]);
    const showSalesRep = !!(await (await admin()).from("clients").select("show_sales_rep_to_client").eq("id", data.clientId).maybeSingle()).data?.show_sales_rep_to_client;
    return {
      scope: "client", showSalesRep, canToggleSalesRep: canManageRole("sales", roles, sc.underway),
      followUp: teamFollowUp(team),
      members: team.map((m) => ({ ...m, name: m.userId ? n.get(m.userId) ?? "Staff member" : null, canManage: canManageRole(m.role, roles, sc.underway) })),
      setupUnderway: sc.underway,
      administrator: fundAdministrator(sc.saasOnly),
      staff: TEAM_ROLES.some((r) => canManageRole(r, roles, sc.underway)) ? await srv.staffDirectory() : [],
      history: events.map((e) => ({ id: e.id, at: e.created_at, role: e.team_role, scope: e.scope, prior: e.prior_user_id ? n.get(e.prior_user_id) ?? "Staff member" : null, next: e.new_user_id ? n.get(e.new_user_id) ?? "Staff member" : null, priorSource: e.prior_source, newSource: e.new_source, by: e.changed_by ? n.get(e.changed_by) ?? "Staff member" : null })),
    };
  });

/** Setup is underway when any of the Client's funds is below 100% setup (or the client has no funds yet). */
async function setupScope(scope: { clientId: string }) {
  const db = await admin();
  const clientId = scope.clientId;
  const { data: fundRows } = await db.from("offerings").select("id").eq("client_id", clientId).is("consolidated_into", null);
  const ids = ((fundRows ?? []) as any[]).map((o) => o.id);
  const { data: c } = clientId ? await db.from("clients").select("saas_only").eq("id", clientId).maybeSingle() : { data: null };
  let underway = !ids.length;
  if (ids.length) {
    const { fundLaunchPercents } = await import("@/lib/fund-launch-percent.server");
    const pct = await fundLaunchPercents(ids);
    underway = ids.some((id) => (pct.get(id) ?? 0) < 100);
  }
  return { underway, saasOnly: !!c?.saas_only };
}

async function assertAssignable(context: any, r: TeamRole, userId: string | null, scope: { clientId: string }) {
  const roles = await requireStaff(context);
  const { underway } = await setupScope(scope);
  if (!canManageRole(r, roles, underway)) throw new Error("You can't change this assignment.");
  if (userId) {
    const { rolesFor } = await import("@/lib/harmonious-team.server");
    if (!eligibleFor(r, await rolesFor(userId))) throw new Error("That person isn't eligible for this assignment.");
  }
}

/** Set or clear a Client assignment. Inheriting Funds follow automatically. */
export const setClientTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ clientId: uuid, role, userId: uuid.nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAssignable(context, data.role, data.userId, { clientId: data.clientId });
    const db = await admin();
    const { data: prev } = await db.from("client_team_assignments").select("user_id").eq("client_id", data.clientId).eq("team_role", data.role).maybeSingle();
    const prior = (prev?.user_id as string | undefined) ?? null;
    if (prior === data.userId) return { changed: false };
    const { error } = data.userId
      ? await db.from("client_team_assignments").upsert({ client_id: data.clientId, team_role: data.role, user_id: data.userId, assigned_by: context.userId, assigned_at: new Date().toISOString() })
      : await db.from("client_team_assignments").delete().eq("client_id", data.clientId).eq("team_role", data.role);
    if (error) throw new Error(error.message);
    const { logTeamEvent } = await import("@/lib/harmonious-team.server");
    await logTeamEvent({ scope: "client", clientId: data.clientId, role: data.role, priorUserId: prior, newUserId: data.userId, priorSource: prior ? "client" : "none", newSource: data.userId ? "client" : "none", changedBy: context.userId });
    return { changed: true };
  });

/** Choose whether the client sees their Sales Team Member as their Sales Representative. Same people who may assign Sales. */
export const setShowSalesRep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ clientId: uuid, show: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const roles = await requireStaff(context);
    const sc = await setupScope({ clientId: data.clientId });
    if (!canManageRole("sales", roles, sc.underway)) throw new Error("Only Sales leadership can change this.");
    const { error } = await (await admin()).from("clients").update({ show_sales_rep_to_client: data.show, updated_at: new Date().toISOString() }).eq("id", data.clientId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** "Your Harmonious Team" for a Fund the caller can already read. Names only. */
export const getMyHarmoniousContacts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ offeringId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: visible } = await context.supabase.from("offerings").select("id").eq("id", data.offeringId).maybeSingle();
    if (!visible) return { contacts: [] };
    const { loadFundTeam } = await import("@/lib/harmonious-team.server");
    const ft = await loadFundTeam(data.offeringId);
    const show = ft.clientId ? !!(await (await admin()).from("clients").select("show_sales_rep_to_client").eq("id", ft.clientId).maybeSingle()).data?.show_sales_rep_to_client : false;
    const contacts = clientFacingContacts(ft.team, show);
    const n = await names(contacts.map((c) => c.userId));
    return { contacts: contacts.map((c) => ({ role: c.role, name: n.get(c.userId) ?? "Harmonious" })) };
  });

/** Client/Fund ids for the "My Clients" / "My Funds" filters. Funds inherit the Client team. */
export const getMyTeamScope = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStaff(context);
    const db = await admin();
    const { data: c } = await db.from("client_team_assignments").select("client_id").eq("user_id", context.userId);
    const clientIds = [...new Set(((c ?? []) as any[]).map((r) => r.client_id))];
    const { data: inherited } = clientIds.length ? await db.from("offerings").select("id").in("client_id", clientIds) : { data: [] };
    return { clientIds, fundIds: ((inherited ?? []) as any[]).map((f) => f.id) };
  });
