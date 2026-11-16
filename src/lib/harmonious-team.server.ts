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
