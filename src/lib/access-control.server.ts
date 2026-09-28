import type { Facts } from "@/lib/access-control-model";
import type { AuthzFacts } from "@/lib/authorize";

/**
 * Read-only Access Control Center (Stage 1). Nothing here changes access, and
 * no enforcement path reads from it. Gate: platform super_admin/admin, or a
 * staff capability to manage staff/roles/permissions — checked on the server
 * for every call, never from the menu.
 */
export async function requireAccessViewer(context: any): Promise<string> {
  const userId = context.userId as string;
  const { data } = await context.supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = ((data ?? []) as any[]).map((r) => String(r.role));
  if (roles.includes("super_admin") || roles.includes("admin")) return userId;
  const { hasOperationsEntry } = await import("@/lib/ops-capabilities");
  if (hasOperationsEntry(roles)) {
    const { loadStaffCapabilities } = await import("@/lib/staff-rbac.server");
    const caps = await loadStaffCapabilities(userId, roles);
    if (caps.some((c) => ["manage_staff", "manage_roles", "manage_permissions"].includes(c))) return userId;
  }
  throw new Error("Forbidden: Access Control is limited to Harmonious access administrators.");
}

export type Bundle = Awaited<ReturnType<typeof loadBundle>>;

export async function loadBundle() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const users: any[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error("Could not load accounts.");
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  const q = (t: string, cols: string) => db.from(t).select(cols).limit(10000).then((r: any) => (r.data ?? []) as any[]);
  const [profiles, roles, grants, customRoles, fms, ifa, ips, cus, clients, companies, offerings, pms, orgs, dels, dperms, assignments, pgrants, roleDefs, auditEvents, classifications] = await Promise.all([
    q("profiles", "user_id, legal_name, email"),
    q("user_roles", "user_id, role, created_at"),
    q("staff_capability_grants", "id, user_id, capability, role_key, granted_by, granted_at, reason, revoked_by, revoked_at"),
    q("staff_custom_roles", "role_key, capabilities, active"),
    q("fund_managers", "user_id, offering_id, granted_by, created_at"),
    q("investor_fund_access", "user_id, offering_id, granted_by, created_at"),
    q("investment_profiles", "id, owner_user_id, display_label, legal_name, profile_type, status"),
    q("client_users", "user_id, client_id, client_role, can_approve, created_at"),
    q("clients", "id, name, legal_name"),
    q("ct_companies", "id, client_id, name, legal_name"),
    q("offerings", "id, name, client_id"),
    q("professional_memberships", "user_id, organization_id, seat_role, status, activated_at, suspended_at, removed_at"),
    q("professional_organizations", "id, name, legal_name"),
    q("delegations", "id, principal_user_id, delegate_user_id, scope_type, scope_id, authority_level, status, acceptance_state, expires_at, revoked_at, revoked_by, revoke_reason, granted_by, created_at, updated_at"),
    q("delegation_permissions", "delegation_id, capability"),
    q("access_role_assignments", "*"),
    q("access_permission_grants", "*"),
    q("access_role_definitions", "*"),
    db.from("access_audit_events").select("*").order("created_at", { ascending: false }).limit(1000).then((r: any) => (r.data ?? []) as any[]),
    q("access_account_classifications", "id, user_id, classification, reason, recorded_by, created_at"),
  ]);
  return { users, profiles, roles, grants, customRoles, fms, ifa, ips, cus, clients, companies, offerings, pms, orgs, dels, dperms, assignments, pgrants, roleDefs, auditEvents, classifications };
}

export function factsFor(b: Bundle, userId: string, names: Map<string, string>): Facts {
  const offer = new Map(b.offerings.map((o: any) => [o.id, o.name]));
  const client = new Map(b.clients.map((c: any) => [c.id, c.name ?? c.legal_name]));
  const org = new Map(b.orgs.map((o: any) => [o.id, o.name ?? o.legal_name]));
  const clientIds = b.cus.filter((c: any) => c.user_id === userId).map((c: any) => c.client_id);
  const permsBy = new Map<string, string[]>();
  for (const p of b.dperms) permsBy.set(p.delegation_id, [...(permsBy.get(p.delegation_id) ?? []), p.capability]);
  const custom: Record<string, string[]> = {};
  for (const r of b.customRoles) if (r.active) custom[r.role_key] = r.capabilities ?? [];
  return {
    userId,
    roles: b.roles.filter((r: any) => r.user_id === userId).map((r: any) => String(r.role)),
    staffGrants: b.grants.filter((g: any) => g.user_id === userId),
    customRoles: custom,
    managedFunds: b.fms.filter((m: any) => m.user_id === userId).map((m: any) => ({ id: m.offering_id, name: offer.get(m.offering_id) ?? "Fund" })),
    investorFunds: b.ifa.filter((m: any) => m.user_id === userId).map((m: any) => ({ id: m.offering_id, name: offer.get(m.offering_id) ?? "Fund" })),
    investmentProfiles: b.ips
      .filter((p: any) => p.owner_user_id === userId)
      .map((p: any) => ({ id: p.id, label: p.display_label ?? p.legal_name ?? p.profile_type, status: p.status })),
    clientMemberships: b.cus
      .filter((c: any) => c.user_id === userId)
      .map((c: any) => ({ id: c.client_id, name: client.get(c.client_id) ?? "Client", role: c.client_role, canApprove: !!c.can_approve })),
    companies: b.companies.filter((c: any) => clientIds.includes(c.client_id)).map((c: any) => ({ id: c.id, name: c.name ?? c.legal_name })),
    professionalMemberships: b.pms
      .filter((m: any) => m.user_id === userId)
      .map((m: any) => ({ orgId: m.organization_id, orgName: org.get(m.organization_id) ?? "Firm", status: String(m.status), seatRole: m.seat_role })),
    delegations: b.dels
      .filter((d: any) => d.delegate_user_id === userId || d.principal_user_id === userId)
      .map((d: any) => ({
        id: d.id,
        direction: d.delegate_user_id === userId ? "acting_for" : "granted_to",
        counterpart: names.get(d.delegate_user_id === userId ? d.principal_user_id : d.delegate_user_id) ?? "Unknown person",
        scope_type: String(d.scope_type),
        scope_id: d.scope_id,
        authority_level: String(d.authority_level),
        status: String(d.status),
        acceptance_state: d.acceptance_state,
        expires_at: d.expires_at,
        revoked_at: d.revoked_at,
        capabilities: permsBy.get(d.id) ?? [],
      })),
  };
}

export function lastChange(b: Bundle, userId: string): string | null {
  const ts: string[] = [];
  for (const r of b.roles) if (r.user_id === userId && r.created_at) ts.push(r.created_at);
  for (const g of b.grants) if (g.user_id === userId) ts.push(...[g.granted_at, g.revoked_at].filter(Boolean));
  for (const m of [...b.fms, ...b.ifa, ...b.cus]) if (m.user_id === userId && m.created_at) ts.push(m.created_at);
  for (const d of b.dels) if (d.delegate_user_id === userId || d.principal_user_id === userId) ts.push(...[d.created_at, d.revoked_at].filter(Boolean));
  return ts.sort().at(-1) ?? null;
}

export function nameMap(b: Bundle) {
  const m = new Map<string, string>();
  for (const u of b.users) m.set(u.id, u.email ?? u.id);
  for (const p of b.profiles) if (p.legal_name) m.set(p.user_id, p.legal_name);
  return m;
}

export function status(u: any): "active" | "suspended" {
  return u.banned_until && Date.parse(u.banned_until) > Date.now() ? "suspended" : "active";
}

export function historyFor(b: Bundle, names: Map<string, string>, userId?: string) {
  const who = (id: string | null) => (id ? names.get(id) ?? "Unknown" : "System");
  const offer = new Map(b.offerings.map((o: any) => [o.id, o.name]));
  const rows: { at: string; actor: string; target: string; change: string; scope: string; reason: string | null }[] = [];
  const mine = (id: string) => !userId || id === userId;
  for (const r of b.roles) if (mine(r.user_id)) rows.push({ at: r.created_at, actor: "Recorded", target: who(r.user_id), change: `Platform role added: ${r.role}`, scope: "Global", reason: null });
  for (const g of b.grants) {
    if (!mine(g.user_id)) continue;
    const what = g.role_key ? `Staff role ${g.role_key}` : `Capability ${g.capability}`;
    rows.push({ at: g.granted_at, actor: who(g.granted_by), target: who(g.user_id), change: `${what} granted`, scope: "Global", reason: g.reason });
    if (g.revoked_at) rows.push({ at: g.revoked_at, actor: who(g.revoked_by), target: who(g.user_id), change: `${what} revoked`, scope: "Global", reason: null });
  }
  for (const m of b.fms) if (mine(m.user_id)) rows.push({ at: m.created_at, actor: who(m.granted_by), target: who(m.user_id), change: "Fund Manager access granted", scope: `Fund: ${offer.get(m.offering_id) ?? "—"}`, reason: null });
  for (const m of b.ifa) if (mine(m.user_id)) rows.push({ at: m.created_at, actor: who(m.granted_by), target: who(m.user_id), change: "Investor fund access granted", scope: `Fund: ${offer.get(m.offering_id) ?? "—"}`, reason: null });
  for (const d of b.dels) {
    if (!mine(d.delegate_user_id) && !mine(d.principal_user_id)) continue;
    rows.push({ at: d.created_at, actor: who(d.granted_by), target: who(d.delegate_user_id), change: `Delegation (${d.authority_level}) granted by ${who(d.principal_user_id)}`, scope: String(d.scope_type), reason: null });
    if (d.revoked_at) rows.push({ at: d.revoked_at, actor: who(d.revoked_by), target: who(d.delegate_user_id), change: "Delegation revoked", scope: String(d.scope_type), reason: d.revoke_reason });
  }
  for (const e of b.auditEvents ?? []) {
    if (userId && e.target_user_id !== userId) continue;
    rows.push({ at: e.created_at, actor: e.actor_identity ?? who(e.actor_user_id), target: who(e.target_user_id), change: `${e.outcome === "denied" ? "REFUSED — " : ""}${e.action}${e.role_key ? `: ${e.role_key}` : ""}${e.permission ? `: ${e.permission}` : ""}`, scope: e.scope_type ? `${e.scope_type}${e.scope_id ? ` ${e.scope_id}` : ""}` : "—", reason: e.reason, authoritative: true } as any);
  }
  return rows.filter((r) => r.at).sort((a, b2) => b2.at.localeCompare(a.at)).slice(0, 500);
}


/** Full canonical facts for one user (resolver input). */
export function authzFactsFor(b: Bundle, userId: string, names = nameMap(b)): AuthzFacts {
  const u = b.users.find((x: any) => x.id === userId);
  const base: Facts = factsFor(b, userId, names);
  return {
    ...base,
    authenticated: !!u,
    suspended: u ? status(u) === "suspended" : true,
    assignments: b.assignments.filter((a: any) => a.user_id === userId),
    grants: b.pgrants.filter((g: any) => g.user_id === userId),
    roleDefinitions: b.roleDefs,
  };
}

/** Append-only access audit. Never updated or deleted (database trigger). */
export async function recordAccessEvent(e: {
  actorUserId: string | null;
  actorIdentity: string | null;
  targetUserId: string | null;
  action: string;
  outcome?: "applied" | "denied";
  roleKey?: string | null;
  permission?: string | null;
  scopeType?: string | null;
  scopeId?: string | null;
  previous?: unknown;
  next?: unknown;
  reason?: string | null;
  correlationId?: string | null;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await (supabaseAdmin as any).from("access_audit_events").insert({
    actor_user_id: e.actorUserId,
    actor_identity: e.actorIdentity,
    target_user_id: e.targetUserId,
    action: e.action,
    outcome: e.outcome ?? "applied",
    role_key: e.roleKey ?? null,
    permission: e.permission ?? null,
    scope_type: e.scopeType ?? null,
    scope_id: e.scopeId ?? null,
    previous_state: e.previous ?? null,
    new_state: e.next ?? null,
    reason: e.reason ?? null,
    correlation_id: e.correlationId ?? null,
  });
  if (error) throw new Error("Could not record the access audit event; nothing was changed.");
}
