/**
 * Read-only RBAC evidence builders. Input is a plain snapshot of access data;
 * output is a summary. Nothing here writes, and collecting evidence never
 * changes access.
 */
import { hasOperationsEntry } from "@/lib/ops-capabilities";
import { EVIDENCE_QUERIES, type EvidenceQuery } from "@/lib/compliance-model";

export type AccessSnapshot = {
  users: { id: string; email?: string | null; banned_until?: string | null }[];
  roles: { user_id: string; role: string; created_at?: string }[];
  grants: { user_id: string; capability?: string | null; role_key?: string | null; revoked_at?: string | null; granted_at?: string; granted_by?: string | null }[];
  assignments: { id: string; user_id: string; role_key: string; scope_type: string; scope_id: string | null; expires_at: string | null; revoked_at: string | null; granted_by?: string | null; created_at?: string }[];
  pgrants: { id: string; user_id: string; permission: string; effect: string; scope_type: string; scope_id: string | null; expires_at: string | null; revoked_at: string | null; granted_by?: string | null }[];
  fms: { user_id: string; offering_id: string }[];
  cus: { user_id: string; client_id: string; client_role: string }[];
  offerings: { id: string }[];
  clients: { id: string }[];
  auditEvents: { id: string; action: string; outcome: string; actor_user_id: string | null; target_user_id: string | null; created_at: string }[];
};

export const PRIVILEGED_ROLES = ["super_admin", "admin"];
const SENSITIVE_HINT = /(tax|tin|government|kyc|identity|execute|money|signing|wire|bank)/i;

export type EvidenceItem = Record<string, string | number | boolean | null>;

export function buildRbacEvidence(q: EvidenceQuery, s: AccessSnapshot, period: { start: string; end: string }, now = Date.now()) {
  const email = new Map(s.users.map((u) => [u.id, u.email ?? u.id]));
  const who = (id: string | null | undefined) => (id ? email.get(id) ?? id : null);
  const rolesOf = (id: string) => s.roles.filter((r) => r.user_id === id).map((r) => r.role);
  const live = (x: { expires_at: string | null; revoked_at: string | null }) => !x.revoked_at && (!x.expires_at || Date.parse(x.expires_at) > now);
  const inPeriod = (at: string) => at.slice(0, 10) >= period.start && at.slice(0, 10) <= period.end;
  let items: EvidenceItem[] = [];
  switch (q) {
    case "super_admins": items = s.roles.filter((r) => r.role === "super_admin").map((r) => ({ user_id: r.user_id, person: who(r.user_id), since: r.created_at ?? null })); break;
    case "privileged_roles": items = s.roles.filter((r) => PRIVILEGED_ROLES.includes(r.role)).map((r) => ({ user_id: r.user_id, person: who(r.user_id), role: r.role })); break;
    case "staff_roles": items = [...new Set(s.roles.map((r) => r.user_id))].filter((id) => hasOperationsEntry(rolesOf(id))).map((id) => ({ user_id: id, person: who(id), roles: rolesOf(id).join(", "), staff_roles: s.grants.filter((g) => g.user_id === id && !g.revoked_at).map((g) => g.role_key ?? g.capability).join(", ") })); break;
    case "direct_grants": items = s.pgrants.filter((g) => g.effect === "allow" && live(g)).map((g) => ({ id: g.id, person: who(g.user_id), permission: g.permission, scope: `${g.scope_type}${g.scope_id ? `:${g.scope_id}` : ""}`, granted_by: who(g.granted_by) })); break;
    case "explicit_denies": items = s.pgrants.filter((g) => g.effect === "deny" && live(g)).map((g) => ({ id: g.id, person: who(g.user_id), permission: g.permission, scope: `${g.scope_type}${g.scope_id ? `:${g.scope_id}` : ""}` })); break;
    case "expired_access": items = [...s.assignments, ...s.pgrants].filter((x) => !x.revoked_at && x.expires_at && Date.parse(x.expires_at) <= now).map((x: any) => ({ id: x.id, person: who(x.user_id), what: x.role_key ?? x.permission, expired_at: x.expires_at })); break;
    case "suspended_users": items = s.users.filter((u) => u.banned_until && Date.parse(u.banned_until) > now).map((u) => ({ user_id: u.id, person: u.email ?? u.id, until: u.banned_until ?? null, roles: rolesOf(u.id).join(", ") })); break;
    case "access_changes": items = s.auditEvents.filter((e) => e.outcome !== "denied" && inPeriod(e.created_at)).map((e) => ({ id: e.id, at: e.created_at, action: e.action, actor: who(e.actor_user_id), target: who(e.target_user_id) })); break;
    case "rejected_escalations": items = s.auditEvents.filter((e) => e.outcome === "denied" && inPeriod(e.created_at)).map((e) => ({ id: e.id, at: e.created_at, action: e.action, actor: who(e.actor_user_id), target: who(e.target_user_id) })); break;
    case "scoped_fund": items = [...s.fms.map((m) => ({ person: who(m.user_id), source: "Fund Manager", fund: m.offering_id })), ...s.assignments.filter((a) => live(a) && a.scope_type === "fund").map((a) => ({ person: who(a.user_id), source: `Role ${a.role_key}`, fund: a.scope_id }))]; break;
    case "scoped_client": items = [...s.cus.map((c) => ({ person: who(c.user_id), source: `Client ${c.client_role}`, client: c.client_id })), ...s.assignments.filter((a) => live(a) && a.scope_type === "client").map((a) => ({ person: who(a.user_id), source: `Role ${a.role_key}`, client: a.scope_id }))]; break;
    case "sensitive_permissions": items = [...s.grants.filter((g) => !g.revoked_at && SENSITIVE_HINT.test(`${g.capability ?? ""} ${g.role_key ?? ""}`)).map((g) => ({ person: who(g.user_id), grant: g.role_key ?? g.capability ?? "" })), ...s.pgrants.filter((g) => live(g) && SENSITIVE_HINT.test(g.permission)).map((g) => ({ person: who(g.user_id), grant: `${g.effect} ${g.permission}` }))]; break;
    case "orphaned_access":
    case "needs_review": {
      const offers = new Set(s.offerings.map((o) => o.id)), clients = new Set(s.clients.map((c) => c.id)), users = new Set(s.users.map((u) => u.id));
      items = [
        ...s.fms.filter((m) => !offers.has(m.offering_id)).map((m) => ({ person: who(m.user_id), issue: "Fund Manager access to a missing fund" })),
        ...s.cus.filter((c) => !clients.has(c.client_id)).map((c) => ({ person: who(c.user_id), issue: "Client membership to a missing client" })),
        ...s.assignments.filter((a) => live(a) && a.scope_type !== "global" && !a.scope_id).map((a) => ({ person: who(a.user_id), issue: `Role ${a.role_key} with no scope (grants nothing)` })),
        ...s.roles.filter((r) => !users.has(r.user_id)).map((r) => ({ person: r.user_id, issue: `Role ${r.role} on a missing account` })),
        ...(q === "needs_review" ? s.roles.filter((r) => r.role === "client_readonly" && !s.cus.some((c) => c.user_id === r.user_id)).map((r) => ({ person: who(r.user_id), issue: "Read-only client role with no client — manual review" })) : []),
      ];
      break;
    }
  }
  return { query: q, control: EVIDENCE_QUERIES[q].control, label: EVIDENCE_QUERIES[q].label, period, record_count: items.length, items };
}

/** Population for access-review campaigns (snapshotted at creation). */
export function accessReviewPopulation(population: "privileged" | "staff" | "scoped", s: AccessSnapshot, now = Date.now()) {
  const email = new Map(s.users.map((u) => [u.id, u.email ?? u.id]));
  const who = (id: string | null | undefined) => (id ? email.get(id) ?? id : "—");
  const rolesOf = (id: string) => s.roles.filter((r) => r.user_id === id).map((r) => r.role);
  const live = (x: { expires_at: string | null; revoked_at: string | null }) => !x.revoked_at && (!x.expires_at || Date.parse(x.expires_at) > now);
  const items: { key: string; person: string; user_id: string; role: string; scope: string; sensitive: string; source: string; granted_by: string; last_used: string; expiry: string }[] = [];
  const add = (i: Omit<(typeof items)[number], "key">) => items.push({ ...i, key: `${i.user_id}|${i.role}|${i.scope}` });
  if (population === "privileged" || population === "staff") {
    for (const r of s.roles) {
      if (population === "privileged" ? !PRIVILEGED_ROLES.includes(r.role) : !hasOperationsEntry(rolesOf(r.user_id))) continue;
      add({ user_id: r.user_id, person: who(r.user_id), role: r.role, scope: "Global", sensitive: PRIVILEGED_ROLES.includes(r.role) ? "Privileged administration" : "", source: "Platform role", granted_by: "—", last_used: "Not tracked", expiry: "None" });
    }
    for (const a of s.assignments.filter((x) => live(x) && (population === "staff" ? x.scope_type === "global" : ["super_administrator", "access_administrator"].includes(x.role_key))))
      add({ user_id: a.user_id, person: who(a.user_id), role: a.role_key, scope: a.scope_type, sensitive: "", source: "Role assignment", granted_by: who(a.granted_by), last_used: "Not tracked", expiry: a.expires_at ?? "None" });
  } else {
    for (const a of s.assignments.filter((x) => live(x) && x.scope_type !== "global"))
      add({ user_id: a.user_id, person: who(a.user_id), role: a.role_key, scope: `${a.scope_type}:${a.scope_id ?? "none"}`, sensitive: "", source: "Role assignment", granted_by: who(a.granted_by), last_used: "Not tracked", expiry: a.expires_at ?? "None" });
    for (const m of s.fms) add({ user_id: m.user_id, person: who(m.user_id), role: "fund_manager", scope: `fund:${m.offering_id}`, sensitive: "", source: "Fund Manager link", granted_by: "—", last_used: "Not tracked", expiry: "None" });
  }
  return items.sort((a, b) => a.person.localeCompare(b.person));
}
