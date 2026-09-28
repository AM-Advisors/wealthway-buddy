/**
 * Shadow authorization (Stage 2.5). Compares a legacy decision with the
 * canonical resolver WITHOUT enforcing it: the legacy result is always what
 * the caller gets back. Records only identifiers and outcome categories.
 */
import { authorize, type AuthzFacts, type Resource } from "@/lib/authorize";

export type ShadowCategory = "allow_allow" | "deny_deny" | "legacy_allow_rbac_deny" | "legacy_deny_rbac_allow";

export function shadowCategory(legacy: boolean, canonical: boolean): ShadowCategory {
  if (legacy && canonical) return "allow_allow";
  if (!legacy && !canonical) return "deny_deny";
  return legacy ? "legacy_allow_rbac_deny" : "legacy_deny_rbac_allow";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ShadowRecord = {
  endpoint: string;
  actor_user_id: string | null;
  permission: string;
  resource_type: string;
  resource_id: string | null;
  legacy_allowed: boolean;
  canonical_allowed: boolean;
  category: ShadowCategory;
  canonical_reason: string | null;
};

/** Pure: returns the authoritative (legacy) decision plus a payload-free record. */
export function shadowCompare(args: { endpoint: string; legacyAllowed: boolean; facts: AuthzFacts; permission: string; resource: Resource }): { allowed: boolean; record: ShadowRecord } {
  const d = authorize(args.facts, args.permission, args.resource);
  const record: ShadowRecord = {
    endpoint: args.endpoint.slice(0, 120),
    actor_user_id: UUID.test(args.facts.userId) ? args.facts.userId : null,
    permission: args.permission.slice(0, 80),
    resource_type: args.resource.type,
    resource_id: args.resource.id && UUID.test(args.resource.id) ? args.resource.id : null,
    legacy_allowed: args.legacyAllowed,
    canonical_allowed: d.allowed,
    category: shadowCategory(args.legacyAllowed, d.allowed),
    // The reason is resolver text only; resource labels are stripped so no names leak.
    canonical_reason: d.allowed ? null : d.reason.replace(args.resource.label ?? "\u0000", "resource").slice(0, 200),
  };
  return { allowed: args.legacyAllowed, record };
}

/** Stage 3A.1: record for a canonical decision computed outside authorize(). Payload-free. */
export function shadowRecordFor(args: { endpoint: string; actorUserId: string; legacyAllowed: boolean; canonical: { allowed: boolean; key: string; reason: string } }): ShadowRecord {
  return {
    endpoint: args.endpoint.slice(0, 120),
    actor_user_id: UUID.test(args.actorUserId) ? args.actorUserId : null,
    permission: args.canonical.key.slice(0, 80),
    resource_type: "global",
    resource_id: null,
    legacy_allowed: args.legacyAllowed,
    canonical_allowed: args.canonical.allowed,
    category: shadowCategory(args.legacyAllowed, args.canonical.allowed),
    canonical_reason: args.canonical.reason.slice(0, 60),
  };
}
