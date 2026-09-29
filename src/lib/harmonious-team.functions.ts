import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { TEAM_ROLES, canManageRole, clientFacingContacts, eligibleFor, teamFollowUp, type TeamRole } from "@/lib/harmonious-team";
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

/** Internal team view for a Client or a Fund. Staff only. */
export const getHarmoniousTeam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: uuid.optional(), offeringId: uuid.optional() }).refine((v) => !!v.clientId !== !!v.offeringId).parse(d))
  .handler(async ({ data, context }) => {
    const roles = await requireStaff(context);
    const srv = await import("@/lib/harmonious-team.server");
    const team = data.clientId
      ? (await import("@/lib/harmonious-team")).resolveTeam({ hasClient: true, client: await srv.loadClientTeam(data.clientId) })
      : (await srv.loadFundTeam(data.offeringId!)).team;
    const events = await history(data.clientId ? { client_id: data.clientId } : { offering_id: data.offeringId });
    const n = await names([...team.map((m) => m.userId), ...events.flatMap((e) => [e.prior_user_id, e.new_user_id, e.changed_by])]);
    return {
      scope: data.clientId ? "client" : "fund",
      followUp: teamFollowUp(team),
      members: team.map((m) => ({ ...m, name: m.userId ? n.get(m.userId) ?? "Staff member" : null, canManage: canManageRole(m.role, roles) })),
      staff: TEAM_ROLES.some((r) => canManageRole(r, roles)) ? await srv.staffDirectory() : [],
      history: events.map((e) => ({ id: e.id, at: e.created_at, role: e.team_role, scope: e.scope, prior: e.prior_user_id ? n.get(e.prior_user_id) ?? "Staff member" : null, next: e.new_user_id ? n.get(e.new_user_id) ?? "Staff member" : null, priorSource: e.prior_source, newSource: e.new_source, by: e.changed_by ? n.get(e.changed_by) ?? "Staff member" : null })),
    };
  });

async function assertAssignable(context: any, r: TeamRole, userId: string | null) {
  const roles = await requireStaff(context);
  if (!canManageRole(r, roles)) throw new Error("You can't change this assignment.");
  if (userId) {
    const { rolesFor } = await import("@/lib/harmonious-team.server");
    if (!eligibleFor(r, await rolesFor(userId))) throw new Error("That person isn't eligible for this assignment.");
  }
}

/** Set or clear a Client assignment. Inheriting Funds follow automatically. */
export const setClientTeamMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: uuid, role, userId: uuid.nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAssignable(context, data.role, data.userId);
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

/** Override one assignment for one Fund, or reset it to the Client (userId null). */
export const setFundTeamOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ offeringId: uuid, role, userId: uuid.nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAssignable(context, data.role, data.userId);
    const srv = await import("@/lib/harmonious-team.server");
    const before = await srv.loadFundTeam(data.offeringId);
    const b = before.team.find((m) => m.role === data.role)!;
    const db = await admin();
    const { error } = data.userId
      ? await db.from("fund_team_overrides").upsert({ offering_id: data.offeringId, team_role: data.role, user_id: data.userId, assigned_by: context.userId, assigned_at: new Date().toISOString() })
      : await db.from("fund_team_overrides").delete().eq("offering_id", data.offeringId).eq("team_role", data.role);
    if (error) throw new Error(error.message);
    const after = (await srv.loadFundTeam(data.offeringId)).team.find((m) => m.role === data.role)!;
    await srv.logTeamEvent({ scope: "fund", clientId: before.clientId, offeringId: data.offeringId, role: data.role, priorUserId: b.userId, newUserId: after.userId, priorSource: b.source, newSource: after.source, changedBy: context.userId });
    return { changed: true };
  });

/** "Your Harmonious Team" for a Fund the caller can already read. Names only. */
export const getMyHarmoniousContacts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ offeringId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: visible } = await context.supabase.from("offerings").select("id").eq("id", data.offeringId).maybeSingle();
    if (!visible) return { contacts: [] };
    const { loadFundTeam } = await import("@/lib/harmonious-team.server");
    const contacts = clientFacingContacts((await loadFundTeam(data.offeringId)).team);
    const n = await names(contacts.map((c) => c.userId));
    return { contacts: contacts.map((c) => ({ role: c.role, name: n.get(c.userId) ?? "Harmonious" })) };
  });

/** Client/Fund ids for the "My Clients" / "My Funds" filters. */
export const getMyTeamScope = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStaff(context);
    const db = await admin();
    const [{ data: c }, { data: o }] = await Promise.all([
      db.from("client_team_assignments").select("client_id, team_role").eq("user_id", context.userId),
      db.from("fund_team_overrides").select("offering_id, team_role").eq("user_id", context.userId),
    ]);
    const clientIds = [...new Set(((c ?? []) as any[]).map((r) => r.client_id))];
    const { data: inherited } = clientIds.length ? await db.from("offerings").select("id, client_id").in("client_id", clientIds) : { data: [] };
    const { data: overridden } = clientIds.length ? await db.from("fund_team_overrides").select("offering_id, team_role").in("offering_id", ((inherited ?? []) as any[]).map((f) => f.id)) : { data: [] };
    const mine = new Set<string>(((o ?? []) as any[]).map((r) => r.offering_id));
    for (const f of (inherited ?? []) as any[]) {
      const myRoles = ((c ?? []) as any[]).filter((r) => r.client_id === f.client_id).map((r) => r.team_role);
      const lost = myRoles.every((r) => ((overridden ?? []) as any[]).some((x) => x.offering_id === f.id && x.team_role === r));
      if (!lost) mine.add(f.id);
    }
    return { clientIds, fundIds: [...mine] };
  });
