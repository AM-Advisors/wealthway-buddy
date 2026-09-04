import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin access required.");
}

type DirectoryEntry = { userId: string; email: string; legalName: string | null };

async function loadDirectory(): Promise<DirectoryEntry[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 500 });
  if (error) throw new Error(error.message);

  const users = data?.users ?? [];
  const ids = users.map((u) => u.id);
  const { data: profiles } = ids.length
    ? await supabaseAdmin.from("profiles").select("user_id, legal_name").in("user_id", ids)
    : { data: [] as any[] };
  const nameMap = new Map((profiles ?? []).map((p: any) => [p.user_id, p.legal_name]));

  return users
    .map((u) => ({
      userId: u.id,
      email: u.email ?? "(no email)",
      legalName: (nameMap.get(u.id) as string | null) ?? null,
    }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

export const listAccessDirectory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const [{ data: offerings, error: offeringError }, managers, investors, roles, directory] =
      await Promise.all([
        supabase.from("offerings").select("id, name, reg_type, is_open").order("name"),
        supabase.from("fund_managers").select("id, user_id, offering_id, created_at"),
        supabase.from("investor_fund_access").select("id, user_id, offering_id, created_at"),
        supabase.from("user_roles").select("user_id, role"),
        loadDirectory(),
      ]);
    if (offeringError) throw new Error(offeringError.message);

    const emailFor = new Map(directory.map((d) => [d.userId, d]));
    const decorate = (rows: any[] | null) =>
      (rows ?? []).map((r: any) => ({
        id: r.id as string,
        userId: r.user_id as string,
        offeringId: r.offering_id as string,
        createdAt: r.created_at as string,
        email: emailFor.get(r.user_id)?.email ?? "(unknown user)",
        legalName: emailFor.get(r.user_id)?.legalName ?? null,
      }));

    return {
      offerings: offerings ?? [],
      users: directory,
      managers: decorate(managers.data as any[]),
      investors: decorate(investors.data as any[]),
      roles: (roles.data ?? []).map((r: any) => ({ userId: r.user_id, role: r.role })),
    };
  });

const assignmentSchema = z.object({
  userId: z.string().uuid(),
  offeringId: z.string().uuid(),
  kind: z.enum(["manager", "investor"]),
});

export const assignFundAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => assignmentSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const table = data.kind === "manager" ? "fund_managers" : "investor_fund_access";
    const { error } = await supabase
      .from(table)
      .upsert(
        { user_id: data.userId, offering_id: data.offeringId, granted_by: userId },
        { onConflict: "user_id,offering_id" },
      );
    if (error) throw new Error(error.message);

    if (data.kind === "manager") {
      const { data: existing } = await supabase
        .from("user_roles")
        .select("id")
        .eq("user_id", data.userId)
        .eq("role", "fund_manager")
        .maybeSingle();
      if (!existing) {
        const { error: roleError } = await supabase
          .from("user_roles")
          .insert({ user_id: data.userId, role: "fund_manager" as any });
        if (roleError) throw new Error(roleError.message);
      }
    }

    return { ok: true };
  });

export const revokeFundAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().uuid(), kind: z.enum(["manager", "investor"]) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const table = data.kind === "manager" ? "fund_managers" : "investor_fund_access";
    const { data: row } = await supabase.from(table).select("user_id").eq("id", data.id).maybeSingle();

    const { error } = await supabase.from(table).delete().eq("id", data.id);
    if (error) throw new Error(error.message);

    if (data.kind === "manager" && row) {
      const { count } = await supabase
        .from("fund_managers")
        .select("id", { count: "exact", head: true })
        .eq("user_id", (row as any).user_id);
      if ((count ?? 0) === 0) {
        await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", (row as any).user_id)
          .eq("role", "fund_manager" as any);
      }
    }

    return { ok: true };
  });

export const listLoginAttempts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        result: z.enum(["all", "success", "failure"]).default("all"),
        search: z.string().trim().max(160).default(""),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    let query = supabase
      .from("login_attempts")
      .select("id, email, success, failure_reason, ip_address, user_agent, created_at")
      .order("created_at", { ascending: false })
      .limit(300);

    if (data.result === "success") query = query.eq("success", true);
    if (data.result === "failure") query = query.eq("success", false);
    if (data.search) query = query.ilike("email", `%${data.search}%`);

    const { data: attempts, error } = await query;
    if (error) throw new Error(error.message);

    const since = Date.now() - 24 * 60 * 60 * 1000;
    const recent = (attempts ?? []).filter((a: any) => new Date(a.created_at).getTime() >= since);
    const failures24h = recent.filter((a: any) => !a.success).length;

    const failureCounts = new Map<string, number>();
    for (const a of recent) {
      if (a.success) continue;
      const key = String(a.email).toLowerCase();
      failureCounts.set(key, (failureCounts.get(key) ?? 0) + 1);
    }
    const watchlist = [...failureCounts.entries()]
      .filter(([, n]) => n >= 3)
      .sort((a, b) => b[1] - a[1])
      .map(([email, count]) => ({ email, count }));

    return { attempts: attempts ?? [], failures24h, watchlist };
  });
