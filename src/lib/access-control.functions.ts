import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  effectivePermissions,
  effectiveRoles,
  scopesSummary,
  sensitiveAccess,
  userTypes,
  type Facts,
} from "@/lib/access-control-model";

/**
 * Read-only Access Control Center (Stage 1). Nothing here changes access, and
 * no enforcement path reads from it. Gate: platform super_admin/admin, or a
 * staff capability to manage staff/roles/permissions — checked on the server
 * for every call, never from the menu.
 */
async function requireAccessViewer(context: any): Promise<string> {
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

export const getAccessControlAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      await requireAccessViewer(context);
      return { allowed: true };
    } catch {
      return { allowed: false };
    }
  });

type Bundle = Awaited<ReturnType<typeof loadBundle>>;

async function loadBundle() {
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
  const [profiles, roles, grants, customRoles, fms, ifa, ips, cus, clients, companies, offerings, pms, orgs, dels, dperms] = await Promise.all([
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
    q("offerings", "id, name"),
    q("professional_memberships", "user_id, organization_id, seat_role, status, activated_at, suspended_at, removed_at"),
    q("professional_organizations", "id, name, legal_name"),
    q("delegations", "id, principal_user_id, delegate_user_id, scope_type, scope_id, authority_level, status, acceptance_state, expires_at, revoked_at, revoked_by, revoke_reason, granted_by, created_at, updated_at"),
    q("delegation_permissions", "delegation_id, capability"),
  ]);
  return { users, profiles, roles, grants, customRoles, fms, ifa, ips, cus, clients, companies, offerings, pms, orgs, dels, dperms };
}

function factsFor(b: Bundle, userId: string, names: Map<string, string>): Facts {
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

function lastChange(b: Bundle, userId: string): string | null {
  const ts: string[] = [];
  for (const r of b.roles) if (r.user_id === userId && r.created_at) ts.push(r.created_at);
  for (const g of b.grants) if (g.user_id === userId) ts.push(...[g.granted_at, g.revoked_at].filter(Boolean));
  for (const m of [...b.fms, ...b.ifa, ...b.cus]) if (m.user_id === userId && m.created_at) ts.push(m.created_at);
  for (const d of b.dels) if (d.delegate_user_id === userId || d.principal_user_id === userId) ts.push(...[d.created_at, d.revoked_at].filter(Boolean));
  return ts.sort().at(-1) ?? null;
}

function nameMap(b: Bundle) {
  const m = new Map<string, string>();
  for (const u of b.users) m.set(u.id, u.email ?? u.id);
  for (const p of b.profiles) if (p.legal_name) m.set(p.user_id, p.legal_name);
  return m;
}

function status(u: any): "active" | "suspended" {
  return u.banned_until && Date.parse(u.banned_until) > Date.now() ? "suspended" : "active";
}

export const listAccessPeople = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAccessViewer(context);
    const b = await loadBundle();
    const names = nameMap(b);
    return b.users.map((u: any) => {
      const f = factsFor(b, u.id, names);
      const perms = effectivePermissions(f);
      const types = userTypes(f);
      const orgs = [
        ...f.clientMemberships.map((c) => c.name),
        ...f.professionalMemberships.filter((m) => m.status === "active").map((m) => m.orgName),
        ...(types.includes("harmonious") ? ["Harmonious"] : []),
      ];
      return {
        userId: u.id as string,
        name: names.get(u.id) ?? u.email ?? "—",
        email: (u.email ?? "") as string,
        types,
        organizations: [...new Set(orgs)],
        roles: effectiveRoles(f),
        scopes: scopesSummary(perms).slice(0, 6),
        scopeCount: scopesSummary(perms).length,
        sensitive: sensitiveAccess(f, perms),
        status: status(u),
        lastSignIn: (u.last_sign_in_at ?? null) as string | null,
        lastPermissionChange: lastChange(b, u.id),
      };
    });
  });

export const getAccessProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await requireAccessViewer(context);
    const b = await loadBundle();
    const u = b.users.find((x: any) => x.id === data.userId);
    if (!u) throw new Error("Person not found.");
    const names = nameMap(b);
    const f = factsFor(b, u.id, names);
    const perms = effectivePermissions(f);
    return {
      identity: {
        userId: u.id as string,
        name: names.get(u.id) ?? u.email,
        email: u.email as string,
        status: status(u),
        createdAt: u.created_at as string,
        lastSignIn: (u.last_sign_in_at ?? null) as string | null,
        types: userTypes(f),
      },
      facts: f,
      roles: effectiveRoles(f),
      sensitive: sensitiveAccess(f, perms),
      permissions: perms,
      history: historyFor(b, names, u.id),
    };
  });

function historyFor(b: Bundle, names: Map<string, string>, userId?: string) {
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
  return rows.filter((r) => r.at).sort((a, b2) => b2.at.localeCompare(a.at)).slice(0, 500);
}

export const listAccessAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAccessViewer(context);
    const b = await loadBundle();
    return historyFor(b, nameMap(b));
  });

export const listAccessRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAccessViewer(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as any).from("staff_custom_roles").select("role_key, label, capabilities, active");
    return { custom: (data ?? []) as { role_key: string; label: string; capabilities: string[]; active: boolean }[] };
  });
