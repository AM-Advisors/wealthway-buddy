import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";
import { MANAGED_ROLES, PRIVILEGED_MANAGED, assignableRoles, assignmentProblem, seesWholeTeam, type ManagedRole } from "@/lib/staff-role-hierarchy";

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;

async function rolesOf(context: any): Promise<string[]> {
  const { data } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
  return ((data ?? []) as any[]).map((r) => String(r.role));
}

/** Staff list with managed roles. Visible to anyone who can assign at least one role. */
export const listStaffRolesFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const mine = await rolesOf(context);
    const canAssign = assignableRoles(mine);
    if (!canAssign.length && !mine.includes("admin")) throw new Error("Only Harmonious leadership can view roles.");
    const db = await admin();
    const { data: rows } = await db.from("user_roles").select("user_id, role").in("role", [...MANAGED_ROLES, "admin", "operations"]);
    const ids = [...new Set(((rows ?? []) as any[]).map((r) => r.user_id))];
    const { data: profs } = ids.length ? await db.from("profiles").select("user_id, email, legal_name").in("user_id", ids) : { data: [] };
    const pm = new Map(((profs ?? []) as any[]).map((p) => [p.user_id, p]));
    const people = ids.map((id) => ({
      userId: id,
      email: pm.get(id)?.email ?? "",
      name: pm.get(id)?.legal_name ?? "",
      roles: ((rows ?? []) as any[]).filter((r) => r.user_id === id).map((r) => String(r.role)),
    })).sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
    const { data: events } = await db.from("staff_role_events").select("*").order("created_at", { ascending: false }).limit(50);
    return { me: context.userId, canAssign, people, events: events ?? [] };
  });

export const changeStaffRoleFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    email: z.string().email().max(255).optional(),
    userId: z.string().uuid().optional(),
    role: z.enum(MANAGED_ROLES),
    action: z.enum(["grant", "revoke"]),
    reason: z.string().trim().min(3).max(500),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const mine = await rolesOf(context);
    const db = await admin();
    let target = data.userId ?? null;
    if (!target && data.email) {
      const { data: p } = await db.from("profiles").select("user_id").ilike("email", data.email.trim()).maybeSingle();
      target = p?.user_id ?? null;
    }
    if (!target) throw new Error("No account found with that email. They need to sign up or be invited first.");
    const { count } = await db.from("user_roles").select("user_id", { count: "exact", head: true }).eq("role", "super_admin");
    const problem = assignmentProblem({ actorId: context.userId, actorRoles: mine, targetId: target, role: data.role, action: data.action, superAdminCount: count ?? 0 });
    if (problem) throw new Error(problem);
    if (data.action === "grant" && PRIVILEGED_MANAGED.includes(data.role as ManagedRole)) {
      const { data: cls } = await db.rpc("current_account_classification", { _user_id: target });
      if (cls !== "individual") throw new Error("Classify this account as Individual (Access Control) before giving it a leadership role.");
    }
    if (data.action === "grant") {
      const { error } = await db.from("user_roles").upsert({ user_id: target, role: data.role }, { onConflict: "user_id,role", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await db.from("user_roles").delete().eq("user_id", target).eq("role", data.role);
      if (error) throw new Error(error.message);
    }
    await db.from("staff_role_events").insert({ actor_id: context.userId, target_user_id: target, role: data.role, action: data.action, reason: data.reason });
    return { ok: true };
  });

/** Sales pipeline: own deals for Sales; whole team for Sales management and above. */
export const salesPipelineFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const mine = await rolesOf(context);
    const team = seesWholeTeam(mine);
    if (!team && !mine.includes("sales")) throw new Error("Sales access only.");
    const db = await admin();
    let q = db.from("crm_deals").select("id, title, stage, amount_cents, expected_close, owner_user_id").is("archived_at", null);
    if (!team) q = q.eq("owner_user_id", context.userId);
    const { data: deals } = await q;
    const list = (deals ?? []) as any[];
    const owners = [...new Set(list.map((d) => d.owner_user_id).filter(Boolean))];
    const { data: profs } = owners.length ? await db.from("profiles").select("user_id, email, legal_name").in("user_id", owners) : { data: [] };
    const name = new Map(((profs ?? []) as any[]).map((p) => [p.user_id, p.legal_name || p.email]));
    const byStage: Record<string, { count: number; cents: number }> = {};
    const byOwner: Record<string, { name: string; count: number; cents: number; won: number }> = {};
    for (const d of list) {
      const s = String(d.stage ?? "open");
      byStage[s] ??= { count: 0, cents: 0 };
      byStage[s].count++; byStage[s].cents += Number(d.amount_cents ?? 0);
      const o = d.owner_user_id ?? "none";
      byOwner[o] ??= { name: name.get(o) ?? "Unassigned", count: 0, cents: 0, won: 0 };
      byOwner[o].count++; byOwner[o].cents += Number(d.amount_cents ?? 0);
      if (/won/i.test(s)) byOwner[o].won += Number(d.amount_cents ?? 0);
    }
    return {
      team,
      stages: Object.entries(byStage).map(([stage, v]) => ({ stage, ...v })),
      leaderboard: Object.values(byOwner).sort((a, b) => b.won - a.won || b.cents - a.cents),
      upcoming: list.filter((d) => d.expected_close).sort((a, b) => String(a.expected_close).localeCompare(String(b.expected_close))).slice(0, 10)
        .map((d) => ({ ...d, owner: name.get(d.owner_user_id) ?? "Unassigned" })),
    };
  });

/** Account Manager book: own clients, or every AM's book for leadership. */
export const accountBookFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const mine = await rolesOf(context);
    const team = seesWholeTeam(mine) || mine.includes("executive") || mine.includes("leadership");
    if (!team && !mine.includes("account_manager")) throw new Error("Account Manager access only.");
    const db = await admin();
    let q = db.from("client_team_assignments").select("client_id, user_id").eq("team_role", "account_manager");
    if (!team) q = q.eq("user_id", context.userId);
    const { data: asg } = await q;
    const rows = (asg ?? []) as any[];
    const clientIds = [...new Set(rows.map((r) => r.client_id))];
    const amIds = [...new Set(rows.map((r) => r.user_id))];
    const [{ data: clients }, { data: offers }, { data: profs }, { data: ams }] = await Promise.all([
      clientIds.length ? db.from("clients").select("id, name").in("id", clientIds) : { data: [] },
      clientIds.length ? db.from("offerings").select("id, client_id, status, updated_at").in("client_id", clientIds) : { data: [] },
      amIds.length ? db.from("profiles").select("user_id, email, legal_name").in("user_id", amIds) : { data: [] },
      team ? db.from("user_roles").select("user_id").eq("role", "account_manager") : { data: [] },
    ]);
    const pn = new Map(((profs ?? []) as any[]).map((p) => [p.user_id, p.legal_name || p.email]));
    const now = Date.now();
    const book = ((clients ?? []) as any[]).map((c) => {
      const funds = ((offers ?? []) as any[]).filter((o) => o.client_id === c.id);
      const inSetup = funds.filter((o) => /setup|draft|pending|request/i.test(String(o.status ?? ""))).length;
      const stale = funds.filter((o) => o.updated_at && now - new Date(o.updated_at).getTime() > 30 * 86400000).length;
      const health = funds.length === 0 ? "No funds" : stale > 0 ? "Needs attention" : inSetup > 0 ? "In setup" : "Healthy";
      const am = rows.find((r) => r.client_id === c.id)?.user_id;
      return { clientId: c.id, name: c.name, funds: funds.length, inSetup, stale, health, accountManager: pn.get(am) ?? "", accountManagerId: am };
    }).sort((a, b) => a.name.localeCompare(b.name));
    const amUserIds = [...new Set([...amIds, ...((ams ?? []) as any[]).map((r) => r.user_id)])];
    const { data: amProfs } = amUserIds.length ? await db.from("profiles").select("user_id, email, legal_name").in("user_id", amUserIds) : { data: [] };
    return { team, book, accountManagers: ((amProfs ?? []) as any[]).map((p) => ({ userId: p.user_id, name: p.legal_name || p.email })) };
  });
