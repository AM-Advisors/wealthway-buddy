import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { factsFor, historyFor, lastChange, loadBundle, nameMap, requireAccessViewer, status } from "@/lib/access-control.server";
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
