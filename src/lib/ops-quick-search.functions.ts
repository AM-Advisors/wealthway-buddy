/**
 * Sidebar quick search: find funds and people by name from the "Find a screen" box.
 * Staff only, read-only; every fund/person screen still authorizes on open.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/require-auth";

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}
async function assertStaff(uid: string) {
  const { OPS_STAFF_ROLES } = await import("@/lib/ops-capabilities");
  const d = await db();
  const { data } = await d.from("user_roles").select("role").eq("user_id", uid);
  const roles = ((data ?? []) as any[]).map((r) => r.role);
  if (!roles.some((r) => (OPS_STAFF_ROLES as readonly string[]).includes(r))) throw new Error("Staff only");
  return roles;
}

export const opsQuickSearchFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => z.object({ q: z.string().trim().max(120) }).parse(x))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const s = data.q.replace(/[%,()]/g, " ").trim();
    if (!s) return { funds: [], clients: [], people: [] };
    const d = await db();
    const [funds, clients, people] = await Promise.all([
      d.from("offerings").select("id, name, is_open").ilike("name", `%${s}%`).order("name").limit(5),
      d.from("clients").select("id, name").ilike("name", `%${s}%`).order("name").limit(5),
      d
        .from("persons")
        .select("id, legal_first_name, legal_last_name, preferred_name, email")
        .or(`email.ilike.%${s}%,legal_first_name.ilike.%${s}%,legal_last_name.ilike.%${s}%,preferred_name.ilike.%${s}%`)
        .order("updated_at", { ascending: false })
        .limit(5),
    ]);
    const personName = (p: any) =>
      [p.preferred_name, [p.legal_first_name, p.legal_last_name].filter(Boolean).join(" ")].find((v: string | null) => !!v?.trim()) || "";
    return {
      funds: ((funds.data ?? []) as any[]).map((f) => ({ id: f.id, name: f.name, open: !!f.is_open })),
      clients: ((clients.data ?? []) as any[]).map((c) => ({ id: c.id, name: c.name ?? "" })),
      people: ((people.data ?? []) as any[]).map((p) => ({ id: p.id, name: personName(p), email: p.email ?? "" })),
    };
  });
