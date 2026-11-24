/** Server helpers for Harmonious Team ownership. Load only inside handlers. */
import { DEFAULT_SALES_EMAIL, TEAM_ROLES, defaultSalesOwner, eligibleFor, resolveTeam, type Assignment, type TeamRole } from "@/lib/harmonious-team";

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;

export async function rolesFor(userId: string): Promise<string[]> {
  const db = await admin();
  const { data } = await db.from("user_roles").select("role").eq("user_id", userId);
  return ((data ?? []) as any[]).map((r) => String(r.role));
}

/** Staff directory with each person's eligibility per assignment. */
export async function staffDirectory() {
  const db = await admin();
  const { data: rows } = await db.from("user_roles").select("user_id, role");
  const byUser = new Map<string, string[]>();
  for (const r of (rows ?? []) as any[]) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), String(r.role)]);
  const ids = [...byUser.keys()];
  const { data: profiles } = ids.length ? await db.from("profiles").select("user_id, legal_name, email").in("user_id", ids) : { data: [] };
  const name = new Map(((profiles ?? []) as any[]).map((p) => [p.user_id, p.legal_name || p.email || "Staff member"]));
  return ids
    .map((id) => ({ id, name: name.get(id) ?? "Staff member", eligible: Object.fromEntries(TEAM_ROLES.map((t) => [t, eligibleFor(t, byUser.get(id)!)])) as Record<TeamRole, boolean> }))
    .filter((s) => TEAM_ROLES.some((t) => s.eligible[t]))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadClientTeam(clientId: string): Promise<Assignment[]> {
  const db = await admin();
  const { data } = await db.from("client_team_assignments").select("team_role, user_id").eq("client_id", clientId);
  return (data ?? []) as Assignment[];
}

export async function loadFundTeam(offeringId: string) {
  const db = await admin();
  const { data: fund } = await db.from("offerings").select("id, client_id").eq("id", offeringId).maybeSingle();
  if (!fund) throw new Error("Fund not found.");
  const client = fund.client_id ? await loadClientTeam(fund.client_id) : [];
  return { clientId: fund.client_id as string | null, team: resolveTeam({ hasClient: !!fund.client_id, client }) };
}

export async function logTeamEvent(e: {
  scope: "client" | "fund"; clientId?: string | null; offeringId?: string | null; role: TeamRole;
  priorUserId: string | null; newUserId: string | null; priorSource: string; newSource: string; changedBy: string;
}) {
  const db = await admin();
  await db.from("team_assignment_events").insert({
    scope: e.scope, client_id: e.clientId ?? null, offering_id: e.offeringId ?? null, team_role: e.role,
    prior_user_id: e.priorUserId, new_user_id: e.newUserId, prior_source: e.priorSource, new_source: e.newSource, changed_by: e.changedBy,
  });
}

/** McKay Pettit is the automatic Sales owner for new Clients; falls back to the creating Sales user. */
async function defaultSalesOwnerId(): Promise<string | null> {
  const db = await admin();
  const { data: profile } = await db.from("profiles").select("user_id").eq("email", DEFAULT_SALES_EMAIL).maybeSingle();
  if (profile?.user_id && eligibleFor("sales", await rolesFor(profile.user_id))) return profile.user_id as string;
  return null;
}

/**
 * Called after a Client is created. Defaults Sales to McKay Pettit, then the creating Sales user.
 * Never throws: missing ownership is a follow-up, not a creation failure.
 */
export async function safeSeedClientTeam(clientId: string, actorId: string) {
  try {
    const owner = (await defaultSalesOwnerId()) ?? defaultSalesOwner(actorId, await rolesFor(actorId));
    if (!owner) return;
    const db = await admin();
    const { error } = await db.from("client_team_assignments").insert({ client_id: clientId, team_role: "sales", user_id: owner, assigned_by: actorId });
    if (!error) await logTeamEvent({ scope: "client", clientId, role: "sales", priorUserId: null, newUserId: owner, priorSource: "none", newSource: "client", changedBy: actorId });
  } catch (err) {
    console.error("client team seed failed", err);
  }
}

export type ClientStaffRow = { client_id: string; user_id: string; team_role: TeamRole };

/**
 * The one list of Harmonious staff assigned to clients (Sales, Account Manager, Operations).
 * The older lead/support coverage list is retired and never read.
 */
export async function clientStaffRows(filter: { clientIds?: string[]; userId?: string } = {}): Promise<ClientStaffRow[]> {
  if (filter.clientIds && !filter.clientIds.length) return [];
  let q = (await admin()).from("client_team_assignments").select("client_id, user_id, team_role");
  if (filter.clientIds) q = q.in("client_id", filter.clientIds);
  if (filter.userId) q = q.eq("user_id", filter.userId);
  const { data, error } = await q.limit(5000);
  if (error) throw new Error("Couldn't read client team assignments.");
  return (data ?? []) as ClientStaffRow[];
}

/** Setup is underway when any of the Client's funds is below 100% setup (or the client has no funds yet). */
export async function clientSetupScope(clientId: string) {
  const db = await admin();
  const { data: fundRows } = await db.from("offerings").select("id").eq("client_id", clientId).is("consolidated_into", null);
  const ids = ((fundRows ?? []) as any[]).map((o) => o.id);
  const { data: c } = await db.from("clients").select("saas_only").eq("id", clientId).maybeSingle();
  let underway = !ids.length;
  if (ids.length) {
    const { fundLaunchPercents } = await import("@/lib/fund-launch-percent.server");
    const pct = await fundLaunchPercents(ids);
    underway = ids.some((id) => (pct.get(id) ?? 0) < 100);
  }
  return { underway, saasOnly: !!c?.saas_only };
}

/**
 * The only way to set or clear a client team assignment. Checks the actor may manage that role
 * and the new person is eligible, then saves and logs the change.
 */
export async function changeClientTeamMember(actorUserId: string, clientId: string, role: TeamRole, userId: string | null) {
  const { staffProfile } = await import("@/lib/harmonious-staff");
  const { canManageRole } = await import("@/lib/harmonious-team");
  const roles = await rolesFor(actorUserId);
  if (!staffProfile(roles).isHarmoniousStaff) throw new Error("Forbidden.");
  const { underway } = await clientSetupScope(clientId);
  if (!canManageRole(role, roles, underway)) throw new Error("You can't change this assignment.");
  if (userId && !eligibleFor(role, await rolesFor(userId))) throw new Error("That person isn't eligible for this assignment.");
  const db = await admin();
  const { data: prev } = await db.from("client_team_assignments").select("user_id").eq("client_id", clientId).eq("team_role", role).maybeSingle();
  const prior = (prev?.user_id as string | undefined) ?? null;
  if (prior === userId) return { changed: false };
  const { error } = userId
    ? await db.from("client_team_assignments").upsert({ client_id: clientId, team_role: role, user_id: userId, assigned_by: actorUserId, assigned_at: new Date().toISOString() })
    : await db.from("client_team_assignments").delete().eq("client_id", clientId).eq("team_role", role);
  if (error) throw new Error(error.message);
  await logTeamEvent({ scope: "client", clientId, role, priorUserId: prior, newUserId: userId, priorSource: prior ? "client" : "none", newSource: userId ? "client" : "none", changedBy: actorUserId });
  return { changed: true };
}
