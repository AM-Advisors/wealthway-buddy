import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { authzFactsFor, loadBundle, recordAccessEvent, type Bundle } from "@/lib/access-control.server";
import {
  accessChangeProblem,
  authorize,
  formatDecision,
  isPermission,
  isProtected,
  PERMISSIONS,
  ROLE_TEMPLATES,
  SCOPE_TYPES,
  templateFor,
  type AccessChange,
  type Resource,
} from "@/lib/authorize";

/**
 * Writable Access Control (RBAC Stage 2). Every mutation: server-side
 * escalation check → append-only audit (before/after) → change. Refused
 * attempts are audited too. Nothing here is gated by what the menu shows.
 */

const reason = z.string().trim().min(5, "Give a reason (at least 5 characters).").max(500);
const scope = z
  .object({ type: z.enum(SCOPE_TYPES as [string, ...string[]]), id: z.string().uuid().nullable() })
  .refine((s) => (s.type === "global") === (s.id === null), "Pick a specific record for a scoped assignment.");
const dates = { effectiveAt: z.string().datetime().nullable().optional(), expiresAt: z.string().datetime().nullable().optional() };

type Ctx = { userId: string };

async function prepare(context: any) {
  const b = await loadBundle();
  const actorId = (context as Ctx).userId;
  const actor = authzFactsFor(b, actorId);
  const identity = b.users.find((u: any) => u.id === actorId)?.email ?? null;
  return { b, actor, actorId, identity, correlationId: crypto.randomUUID() };
}

function resourceFor(b: Bundle) {
  return (s: { type: any; id: string | null }): Resource => {
    if (s.type === "fund") {
      const off = b.offerings.find((o: any) => o.id === s.id);
      return { type: "fund", id: s.id, label: off?.name, ancestors: off?.client_id ? [{ type: "client", id: off.client_id }] : [] };
    }
    if (s.type === "company") {
      const co = b.companies.find((c: any) => c.id === s.id);
      return { type: "company", id: s.id, label: co?.name, ancestors: co?.client_id ? [{ type: "client", id: co.client_id }] : [] };
    }
    return { type: s.type, id: s.id };
  };
}

async function gate(p: Awaited<ReturnType<typeof prepare>>, change: AccessChange, why: string, extra: Record<string, unknown> = {}) {
  const problem = accessChangeProblem(p.actor, change, resourceFor(p.b));
  if (problem) {
    await recordAccessEvent({
      actorUserId: p.actorId,
      actorIdentity: p.identity,
      targetUserId: "targetUserId" in change ? change.targetUserId : null,
      action: `Refused: ${change.kind}`,
      outcome: "denied",
      roleKey: "roleKey" in change ? change.roleKey : null,
      permission: "permission" in change ? change.permission : null,
      scopeType: "scope" in change ? change.scope.type : null,
      scopeId: "scope" in change ? change.scope.id : null,
      next: { attempted: change, ...extra, refusal: problem },
      reason: why,
      correlationId: p.correlationId,
    });
    throw new Error(problem);
  }
}

function snapshot(b: Bundle, userId: string) {
  return {
    platformRoles: b.roles.filter((r: any) => r.user_id === userId).map((r: any) => r.role),
    assignments: b.assignments.filter((a: any) => a.user_id === userId && !a.revoked_at).map((a: any) => ({ id: a.id, role: a.role_key, scope: `${a.scope_type}:${a.scope_id ?? "*"}`, expires_at: a.expires_at })),
    grants: b.pgrants.filter((g: any) => g.user_id === userId && !g.revoked_at).map((g: any) => ({ id: g.id, permission: g.permission, effect: g.effect, scope: `${g.scope_type}:${g.scope_id ?? "*"}`, expires_at: g.expires_at })),
  };
}

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;

// ------------------------------------------------------------ roles

export const assignAccessRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ targetUserId: z.string().uuid(), roleKey: z.string().min(2).max(80), scope, reason, ...dates }).parse(d))
  .handler(async ({ context, data }) => {
    const p = await prepare(context);
    const change: AccessChange = { kind: "assign_role", targetUserId: data.targetUserId, roleKey: data.roleKey, scope: data.scope as any };
    await gate(p, change, data.reason);
    const t = templateFor(data.roleKey);
    const custom = p.b.roleDefs.filter((r: any) => r.role_key === data.roleKey).sort((a: any, b: any) => b.version - a.version)[0];
    if (!t && !custom) throw new Error("Unknown role.");
    if (custom?.status === "inactive") throw new Error("That role is deactivated.");
    if (t && !t.scopeTypes.includes(data.scope.type as any)) throw new Error(`${t.label} must be scoped to: ${t.scopeTypes.join(", ")}.`);
    if (!t && data.scope.type !== "global") throw new Error("Custom Harmonious roles are global.");
    const before = snapshot(p.b, data.targetUserId);
    const db = await admin();
    if (t?.platformRole) {
      if (data.effectiveAt || data.expiresAt) throw new Error("Harmonious platform roles take effect immediately and have no expiry; use a scoped role or direct grant for timed access.");
      if (before.platformRoles.includes(t.platformRole)) throw new Error("This person already has that role.");
      await recordAccessEvent({ actorUserId: p.actorId, actorIdentity: p.identity, targetUserId: data.targetUserId, action: "Role assigned", roleKey: data.roleKey, scopeType: "global", previous: before, next: { ...before, platformRoles: [...before.platformRoles, t.platformRole] }, reason: data.reason, correlationId: p.correlationId });
      const { error } = await db.from("user_roles").insert({ user_id: data.targetUserId, role: t.platformRole });
      if (error) throw new Error("Could not assign the role.");
      return { ok: true };
    }
    const row = {
      user_id: data.targetUserId, role_key: data.roleKey, role_version: custom?.version ?? null,
      scope_type: data.scope.type, scope_id: data.scope.id,
      effective_at: data.effectiveAt ?? new Date().toISOString(), expires_at: data.expiresAt ?? null,
      granted_by: p.actorId, reason: data.reason,
    };
    await recordAccessEvent({ actorUserId: p.actorId, actorIdentity: p.identity, targetUserId: data.targetUserId, action: data.scope.type === "global" ? "Role assigned" : "Scope added", roleKey: data.roleKey, scopeType: data.scope.type, scopeId: data.scope.id, previous: before, next: { added: row }, reason: data.reason, correlationId: p.correlationId });
    const { error } = await db.from("access_role_assignments").insert(row);
    if (error) throw new Error("Could not assign the role.");
    return { ok: true };
  });

export const revokeAccessRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ targetUserId: z.string().uuid(), roleKey: z.string(), assignmentId: z.string().uuid().nullable(), reason }).parse(d))
  .handler(async ({ context, data }) => {
    const p = await prepare(context);
    const a = data.assignmentId ? p.b.assignments.find((x: any) => x.id === data.assignmentId && x.user_id === data.targetUserId && !x.revoked_at) : null;
    const sc = a ? { type: a.scope_type, id: a.scope_id } : { type: "global" as const, id: null };
    await gate(p, { kind: "revoke_role", targetUserId: data.targetUserId, roleKey: data.roleKey, scope: sc }, data.reason);
    const before = snapshot(p.b, data.targetUserId);
    const db = await admin();
    const t = templateFor(data.roleKey);
    if (!a && t?.platformRole) {
      if (!before.platformRoles.includes(t.platformRole)) throw new Error("This person doesn't have that role.");
      if (t.platformRole === "super_admin" && p.b.roles.filter((r: any) => r.role === "super_admin").length <= 1) {
        throw new Error("You can't remove the last Super Administrator.");
      }
      await recordAccessEvent({ actorUserId: p.actorId, actorIdentity: p.identity, targetUserId: data.targetUserId, action: "Role revoked", roleKey: data.roleKey, scopeType: "global", previous: before, next: { ...before, platformRoles: before.platformRoles.filter((r: string) => r !== t.platformRole) }, reason: data.reason, correlationId: p.correlationId });
      const { error } = await db.from("user_roles").delete().eq("user_id", data.targetUserId).eq("role", t.platformRole);
      if (error) throw new Error("Could not remove the role.");
      return { ok: true };
    }
    if (!a) throw new Error("Assignment not found.");
    await recordAccessEvent({ actorUserId: p.actorId, actorIdentity: p.identity, targetUserId: data.targetUserId, action: a.scope_type === "global" ? "Role revoked" : "Scope removed", roleKey: data.roleKey, scopeType: a.scope_type, scopeId: a.scope_id, previous: before, next: { revoked: a.id }, reason: data.reason, correlationId: p.correlationId });
    const { error } = await db.from("access_role_assignments").update({ revoked_at: new Date().toISOString(), revoked_by: p.actorId, revoke_reason: data.reason }).eq("id", a.id);
    if (error) throw new Error("Could not revoke the role.");
    return { ok: true };
  });

// ------------------------------------------------------------ direct grants / denies

export const grantAccessPermission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ targetUserId: z.string().uuid(), permission: z.string().max(80), effect: z.enum(["allow", "deny"]), scope, reason, ...dates }).parse(d))
  .handler(async ({ context, data }) => {
    const p = await prepare(context);
    await gate(p, { kind: "grant", targetUserId: data.targetUserId, permission: data.permission, effect: data.effect, scope: data.scope as any }, data.reason);
    const before = snapshot(p.b, data.targetUserId);
    const row = {
      user_id: data.targetUserId, permission: data.permission, effect: data.effect,
      scope_type: data.scope.type, scope_id: data.scope.id,
      effective_at: data.effectiveAt ?? new Date().toISOString(), expires_at: data.expiresAt ?? null,
      granted_by: p.actorId, reason: data.reason,
    };
    await recordAccessEvent({ actorUserId: p.actorId, actorIdentity: p.identity, targetUserId: data.targetUserId, action: data.effect === "deny" ? "Permission denied" : "Permission granted", permission: data.permission, scopeType: data.scope.type, scopeId: data.scope.id, previous: before, next: { added: row }, reason: data.reason, correlationId: p.correlationId });
    const { error } = await (await admin()).from("access_permission_grants").insert(row);
    if (error) throw new Error("Could not save the permission.");
    return { ok: true };
  });

export const revokeAccessPermission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ targetUserId: z.string().uuid(), grantId: z.string().uuid(), reason }).parse(d))
  .handler(async ({ context, data }) => {
    const p = await prepare(context);
    const g = p.b.pgrants.find((x: any) => x.id === data.grantId && x.user_id === data.targetUserId && !x.revoked_at);
    if (!g) throw new Error("Grant not found or already revoked.");
    await gate(p, { kind: "revoke_grant", targetUserId: data.targetUserId, permission: g.permission, effect: g.effect, scope: { type: g.scope_type, id: g.scope_id } }, data.reason);
    await recordAccessEvent({ actorUserId: p.actorId, actorIdentity: p.identity, targetUserId: data.targetUserId, action: g.effect === "deny" ? "Permission deny revoked" : "Permission revoked", permission: g.permission, scopeType: g.scope_type, scopeId: g.scope_id, previous: snapshot(p.b, data.targetUserId), next: { revoked: g.id }, reason: data.reason, correlationId: p.correlationId });
    const { error } = await (await admin()).from("access_permission_grants").update({ revoked_at: new Date().toISOString(), revoked_by: p.actorId, revoke_reason: data.reason }).eq("id", g.id);
    if (error) throw new Error("Could not revoke.");
    return { ok: true };
  });

// ------------------------------------------------------------ account state

export const setAccountState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ targetUserId: z.string().uuid(), suspended: z.boolean(), reason }).parse(d))
  .handler(async ({ context, data }) => {
    const p = await prepare(context);
    await gate(p, { kind: "account_state", targetUserId: data.targetUserId, suspended: data.suspended }, data.reason);
    const target = authzFactsFor(p.b, data.targetUserId);
    if (data.suspended && target.roles.includes("super_admin") && !p.actor.roles.includes("super_admin")) {
      throw new Error("Only a Super Administrator can suspend a Super Administrator.");
    }
    await recordAccessEvent({ actorUserId: p.actorId, actorIdentity: p.identity, targetUserId: data.targetUserId, action: data.suspended ? "Account suspended" : "Account restored", previous: { suspended: target.suspended }, next: { suspended: data.suspended }, reason: data.reason, correlationId: p.correlationId });
    const db = await admin();
    const { error } = await db.auth.admin.updateUserById(data.targetUserId, { ban_duration: data.suspended ? "876000h" : "none" });
    if (error) throw new Error("Could not change the account state.");
    return { ok: true };
  });

// ------------------------------------------------------------ role definitions (versioned)

const permList = z.array(z.string()).max(PERMISSIONS.length).refine((l) => l.every((x) => isPermission(x) && !isProtected(x)), "Only standard, non-protected permissions can be put in a role.");

export const saveRoleDefinition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      mode: z.enum(["create", "clone", "edit", "deactivate"]),
      roleKey: z.string().regex(/^[a-z][a-z0-9_]{2,40}$/, "Use lowercase letters, numbers and underscores."),
      label: z.string().trim().min(2).max(80).optional(),
      permissions: permList.optional(),
      cloneFrom: z.string().optional(),
      reason,
    }).parse(d))
  .handler(async ({ context, data }) => {
    const p = await prepare(context);
    await gate(p, { kind: "role_definition", roleKey: data.roleKey }, data.reason);
    if (templateFor(data.roleKey)) throw new Error("Predefined templates can't be changed; clone one into a custom role instead.");
    const versions = p.b.roleDefs.filter((r: any) => r.role_key === data.roleKey).sort((a: any, b: any) => b.version - a.version);
    const latest = versions[0];
    let row: any;
    if (data.mode === "create" || data.mode === "clone") {
      if (latest) throw new Error("A role with that key already exists.");
      const src = data.mode === "clone" ? templateFor(data.cloneFrom ?? "") ?? null : null;
      const srcCustom = data.mode === "clone" && !src ? p.b.roleDefs.filter((r: any) => r.role_key === data.cloneFrom).sort((a: any, b: any) => b.version - a.version)[0] : null;
      if (data.mode === "clone" && !src && !srcCustom) throw new Error("Pick a role to clone.");
      const perms = data.permissions ?? src?.permissions ?? srcCustom?.permissions ?? [];
      row = { role_key: data.roleKey, version: 1, label: data.label ?? data.roleKey, category: "custom", permissions: perms.filter((x: string) => isPermission(x) && !isProtected(x)), status: "active", cloned_from: data.cloneFrom ?? null, created_by: p.actorId, reason: data.reason };
    } else {
      if (!latest) throw new Error("Role not found.");
      row = {
        role_key: data.roleKey, version: latest.version + 1, label: data.label ?? latest.label, category: "custom",
        permissions: data.mode === "deactivate" ? latest.permissions : data.permissions ?? latest.permissions,
        status: data.mode === "deactivate" ? "inactive" : "active", cloned_from: latest.cloned_from, created_by: p.actorId, reason: data.reason,
      };
    }
    await recordAccessEvent({ actorUserId: p.actorId, actorIdentity: p.identity, targetUserId: null, action: `Role ${data.mode === "edit" ? "edited (new version)" : data.mode === "deactivate" ? "deactivated" : data.mode === "clone" ? "cloned" : "created"}`, roleKey: data.roleKey, previous: latest ?? null, next: row, reason: data.reason, correlationId: p.correlationId });
    const { error } = await (await admin()).from("access_role_definitions").insert(row);
    if (error) throw new Error("Could not save the role.");
    return { ok: true, version: row.version };
  });

// ------------------------------------------------------------ reads for the writable UI

export const getAccessAdminContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const p = await prepare(context);
    const canManage = authorize(p.actor, "administration.manage_access", { type: "global", id: null }).allowed;
    const isSuper = p.actor.roles.includes("super_admin");
    const assignedCount = (key: string) => {
      const t = templateFor(key);
      if (t?.platformRole) return p.b.roles.filter((r: any) => r.role === t.platformRole).length;
      return new Set(p.b.assignments.filter((a: any) => a.role_key === key && !a.revoked_at).map((a: any) => a.user_id)).size;
    };
    const who = (id: string | null) => (id ? p.b.users.find((u: any) => u.id === id)?.email ?? "Unknown" : "Harmonious (built-in)");
    const byKey = new Map<string, any[]>();
    for (const d of p.b.roleDefs) byKey.set(d.role_key, [...(byKey.get(d.role_key) ?? []), d]);
    const custom = [...byKey.entries()].map(([key, list]) => {
      const sorted = list.sort((a, b) => a.version - b.version);
      const last = sorted.at(-1);
      return { key, label: last.label, version: last.version, permissions: last.permissions as string[], assigned: assignedCount(key), createdBy: who(sorted[0].created_by), updatedBy: who(last.created_by), status: last.status as string, versions: sorted.map((v) => ({ version: v.version, at: v.created_at, by: who(v.created_by), status: v.status, reason: v.reason })) };
    });
    return {
      canManage,
      isSuper,
      actorId: p.actorId,
      templates: ROLE_TEMPLATES.map((t) => ({ key: t.key, label: t.label, category: t.category, scopeTypes: t.scopeTypes, permissions: t.permissions, platformRole: t.platformRole ?? null, superAdminOnly: !!t.superAdminOnly, assigned: assignedCount(t.key) })),
      custom,
      permissions: PERMISSIONS,
      scopes: {
        client: p.b.clients.map((c: any) => ({ id: c.id, label: c.name ?? c.legal_name })),
        fund: p.b.offerings.map((o: any) => ({ id: o.id, label: o.name })),
        company: p.b.companies.map((c: any) => ({ id: c.id, label: c.name ?? c.legal_name })),
        investment_profile: p.b.ips.map((i: any) => ({ id: i.id, label: i.display_label ?? i.legal_name ?? i.profile_type })),
      },
    };
  });

/** Explain one decision for the person matrix (canonical resolver only). */
export const explainAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ targetUserId: z.string().uuid(), permission: z.string(), scope }).parse(d))
  .handler(async ({ context, data }) => {
    const p = await prepare(context);
    if (!authorize(p.actor, "administration.manage_access", { type: "global", id: null }).allowed && !p.actor.roles.includes("admin")) {
      throw new Error("Forbidden.");
    }
    const d = authorize(authzFactsFor(p.b, data.targetUserId), data.permission, resourceFor(p.b)(data.scope));
    return { ...d, text: formatDecision(d) };
  });
