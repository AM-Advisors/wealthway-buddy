import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authorize, formatDecision, isLive, PERMISSIONS, templateFor } from "@/lib/authorize";
import { ATOMIC_PERMISSIONS, covers } from "@/lib/atomic-permissions";
import { CLASSIFICATION_PROPOSALS, currentClassification } from "@/lib/account-classification";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { authzFactsFor, factsFor, historyFor, lastChange, loadBundle, nameMap, requireAccessViewer, status } from "@/lib/access-control.server";
import {
  effectivePermissions,
  effectiveRoles,
  scopesSummary,
  sensitiveAccess,
  userTypes,
} from "@/lib/access-control-model";

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
        accountType: currentClassification(b.classifications, u.id),
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
      canonical: canonicalView(b, u.id),
      classification: currentClassification(b.classifications, u.id),
      classificationProposal: currentClassification(b.classifications, u.id) ? null : CLASSIFICATION_PROPOSALS[u.id] ?? null,
    };
  });

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

/** Canonical-resolver records for one person, plus a global person matrix. */
function canonicalView(b: any, userId: string) {
  const af = authzFactsFor(b, userId);
  const label = (t: string, id: string | null) => {
    if (!id) return "All resources";
    const hit = t === "client" ? b.clients.find((c: any) => c.id === id) : t === "fund" ? b.offerings.find((o: any) => o.id === id) : t === "company" ? b.companies.find((c: any) => c.id === id) : b.ips.find((i: any) => i.id === id);
    return `${t}: ${hit?.name ?? hit?.display_label ?? hit?.legal_name ?? id.slice(0, 8)}`;
  };
  const live = (r: any) => isLive(r);
  return {
    suspended: af.suspended,
    assignments: af.assignments.map((a: any) => ({ id: a.id, roleKey: a.role_key, label: templateFor(a.role_key)?.label ?? a.role_key, version: a.role_version, scope: label(a.scope_type, a.scope_id), effectiveAt: a.effective_at, expiresAt: a.expires_at, revokedAt: a.revoked_at, live: live(a), reason: a.reason })),
    grants: af.grants.map((g: any) => ({ id: g.id, permission: g.permission, effect: g.effect, scope: label(g.scope_type, g.scope_id), effectiveAt: g.effective_at, expiresAt: g.expires_at, revokedAt: g.revoked_at, live: live(g), reason: g.reason })),
    atomic: ATOMIC_PERMISSIONS.map((a) => {
      const d = authorize(af, a.key, { type: "global", id: null });
      const scoped = [...effectivePermissions(af).filter((x) => x.scope.type !== "global" && covers(`${x.area}.${x.action}`, a.key)).map((x) => ({ source: x.via, scope: x.scope.label })),
        ...af.assignments.filter((x: any) => isLive(x) && x.scope_type !== "global" && x.scope_id && (templateFor(x.role_key)?.permissions ?? []).some((h: string) => covers(h, a.key))).map((x: any) => ({ source: `Role: ${templateFor(x.role_key)?.label ?? x.role_key}`, scope: label(x.scope_type, x.scope_id) })),
        ...af.grants.filter((g: any) => isLive(g) && g.scope_type !== "global" && g.scope_id && covers(g.permission, a.key)).map((g: any) => ({ source: g.effect === "deny" ? "Direct deny" : "Direct grant", scope: label(g.scope_type, g.scope_id) }))];
      return { key: a.key, label: a.label, area: a.area, summary: a.summary, destructive: !!a.destructive, global: d.allowed, text: formatDecision(d), sources: d.sources, scoped };
    }),
    matrix: PERMISSIONS.map((perm) => {
      const d = authorize(af, perm, { type: "global", id: null });
      const scoped = [...effectivePermissions(af).filter((x) => `${x.area}.${x.action}` === perm && x.scope.type !== "global").map((x) => ({ source: x.via, scope: x.scope.label })),
        ...af.assignments.filter((a: any) => isLive(a) && a.scope_type !== "global" && (templateFor(a.role_key)?.permissions ?? []).includes(perm as any)).map((a: any) => ({ source: `Role: ${templateFor(a.role_key)?.label ?? a.role_key}`, scope: label(a.scope_type, a.scope_id) })),
        ...af.grants.filter((g: any) => isLive(g) && g.permission === perm && g.scope_type !== "global").map((g: any) => ({ source: g.effect === "deny" ? "Direct deny" : "Direct grant", scope: label(g.scope_type, g.scope_id) }))];
      return { permission: perm, global: d.allowed, text: formatDecision(d), sources: d.sources, scoped };
    }),
  };
}
