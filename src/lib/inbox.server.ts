/**
 * Client <-> Harmonious inbox. Server-only; every read/write re-derives the
 * caller's access from roles, client membership and team assignments.
 */
import { staffProfile } from "@/lib/harmonious-staff";

export type Channel = "operations" | "sales" | "rep" | "direct";

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export async function inboxActor(userId: string) {
  const d = await db();
  const [{ data: roles }, { data: cu }, { data: fm }, { data: prof }] = await Promise.all([
    d.from("user_roles").select("role").eq("user_id", userId),
    d.from("client_users").select("client_id").eq("user_id", userId),
    d.from("fund_managers").select("offering_id").eq("user_id", userId),
    d.from("profiles").select("email").eq("user_id", userId).maybeSingle(),
  ]);
  const roleList = ((roles ?? []) as any[]).map((r) => String(r.role));
  const staff = staffProfile(roleList);
  const clientIds = new Set<string>(((cu ?? []) as any[]).map((r) => r.client_id));
  const offIds = ((fm ?? []) as any[]).map((r) => r.offering_id);
  if (offIds.length) {
    const { data: offs } = await d.from("offerings").select("client_id").in("id", offIds);
    for (const o of (offs ?? []) as any[]) if (o.client_id) clientIds.add(o.client_id);
  }
  const isAdmin = roleList.includes("admin") || roleList.includes("super_admin");
  return {
    userId,
    email: ((prof as any)?.email as string | undefined)?.trim().toLowerCase() || null,
    clientIds: [...clientIds],
    ops: staff.operationsAccess,
    sales: staff.teams.includes("sales"),
    isAdmin,
    isStaff: staff.isHarmoniousStaff,
  };
}
export type InboxActor = Awaited<ReturnType<typeof inboxActor>>;

export function canSeeThread(a: InboxActor, t: { client_id: string | null; channel: Channel; rep_user_id: string | null; created_by?: string | null; addressed_email?: string | null; participant_user_id?: string | null }) {
  // Direct conversations are private to the two people in them (no admin read-through).
  if (t.channel === "direct") return t.created_by === a.userId || t.participant_user_id === a.userId ? (a.isStaff ? "harmonious" as const : "client" as const) : null;
  if (!t.client_id) return null;
  // Client side: each person sees conversations they started or that Harmonious addressed to them.
  if (a.clientIds.includes(t.client_id) && (t.created_by === a.userId || (!!a.email && t.addressed_email?.toLowerCase() === a.email))) return "client" as const;
  if (a.isAdmin) return "harmonious" as const;
  if (t.channel === "operations" && a.ops) return "harmonious" as const;
  if (t.channel === "sales" && a.sales) return "harmonious" as const;
  if (t.channel === "rep" && t.rep_user_id === a.userId) return "harmonious" as const;
  return null;
}

async function names(ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const { data } = await (await db()).from("profiles").select("user_id, legal_name, email").in("user_id", ids);
  return new Map(((data ?? []) as any[]).map((p) => [p.user_id, (p.legal_name || p.email || "Harmonious") as string]));
}

/** Dedicated representatives assigned to the client (canonical team assignments). */
export async function repsFor(clientIds: string[]) {
  if (!clientIds.length) return [];
  const { data } = await (await db()).from("client_team_assignments").select("client_id, team_role, user_id").in("client_id", clientIds);
  const rows = ((data ?? []) as any[]).filter((r) => r.user_id);
  const n = await names([...new Set(rows.map((r) => r.user_id as string))]);
  return rows.map((r) => ({ clientId: r.client_id as string, userId: r.user_id as string, role: String(r.team_role), name: n.get(r.user_id) ?? "Representative" }));
}

export async function listThreads(a: InboxActor) {
  const d = await db();
  const ors: string[] = [];
  if (a.clientIds.length) ors.push(`and(created_by.eq.${a.userId},client_id.in.(${a.clientIds.join(",")}))`);
  if (a.clientIds.length && a.email && /^[^,()"\s]+$/.test(a.email)) ors.push(`and(addressed_email.ilike.${a.email},client_id.in.(${a.clientIds.join(",")}))`);
  ors.push(`participant_user_id.eq.${a.userId}`, `and(channel.eq.direct,created_by.eq.${a.userId})`);
  if (!a.isAdmin) {
    if (a.ops) ors.push("channel.eq.operations");
    if (a.sales) ors.push("channel.eq.sales");
    ors.push(`rep_user_id.eq.${a.userId}`);
  }
  let q = d.from("inbox_threads").select("*").order("last_message_at", { ascending: false }).limit(300);
  if (!a.isAdmin) q = q.or(ors.join(","));
  const { data } = await q;
  const threads = ((data ?? []) as any[]).filter((t) => canSeeThread(a, t));
  const ids = threads.map((t) => t.id);
  const [{ data: marks }, { data: clients }] = await Promise.all([
    ids.length ? d.from("inbox_read_markers").select("thread_id, read_at").eq("user_id", a.userId).in("thread_id", ids) : { data: [] },
    threads.some((t) => t.client_id) ? d.from("clients").select("id, name").in("id", [...new Set(threads.map((t) => t.client_id).filter(Boolean))]) : { data: [] },
  ]);
  const m = new Map(((marks ?? []) as any[]).map((r) => [r.thread_id, r.read_at]));
  const c = new Map(((clients ?? []) as any[]).map((r) => [r.id, r.name]));
  const reps = await names([...new Set(threads.flatMap((t) => [t.rep_user_id, t.participant_user_id, t.channel === "direct" ? t.created_by : null]).filter(Boolean))]);
  return threads.map((t) => ({
    id: t.id as string,
    subject: t.subject as string,
    channel: t.channel as Channel,
    clientName: t.client_id ? ((c.get(t.client_id) as string) ?? "Client") : null,
    withName: t.channel === "direct" ? reps.get(t.participant_user_id === a.userId ? t.created_by : t.participant_user_id) ?? "Contact" : null,
    participantKind: (t.participant_kind as string | null) ?? null,
    repName: t.rep_user_id ? reps.get(t.rep_user_id) ?? "Representative" : null,
    lastMessageAt: t.last_message_at as string,
    unread: !m.get(t.id) || new Date(m.get(t.id)) < new Date(t.last_message_at),
    side: canSeeThread(a, t)!,
  }));
}

export async function loadThread(a: InboxActor, id: string) {
  const d = await db();
  const { data: t } = await d.from("inbox_threads").select("*").eq("id", id).maybeSingle();
  if (!t || !canSeeThread(a, t)) throw new Error("That conversation is not available.");
  const { data: msgs } = await d.from("inbox_messages").select("id, sender_id, sender_side, body, created_at").eq("thread_id", id).order("created_at");
  const n = await names([...new Set(((msgs ?? []) as any[]).map((m) => m.sender_id))]);
  await d.from("inbox_read_markers").upsert({ user_id: a.userId, thread_id: id, read_at: new Date().toISOString() });
  return {
    thread: { id: t.id, subject: t.subject, channel: t.channel as Channel },
    messages: ((msgs ?? []) as any[]).map((m) => ({ ...m, senderName: n.get(m.sender_id) ?? "", mine: m.sender_id === a.userId })),
  };
}

export async function startThread(a: InboxActor, input: { clientId: string; channel: Channel; repUserId: string | null; subject: string; body: string }) {
  if (!a.clientIds.includes(input.clientId)) throw new Error("You can only message Harmonious for your own company.");
  if (input.channel === "rep") {
    const reps = await repsFor([input.clientId]);
    if (!input.repUserId || !reps.some((r) => r.userId === input.repUserId)) throw new Error("That person is not assigned to your company.");
  }
  const d = await db();
  const { data: t, error } = await d.from("inbox_threads").insert({
    client_id: input.clientId, channel: input.channel, rep_user_id: input.channel === "rep" ? input.repUserId : null,
    subject: input.subject, created_by: a.userId,
  }).select("id").single();
  if (error) throw new Error("Could not start the conversation.");
  await d.from("inbox_messages").insert({ thread_id: t.id, sender_id: a.userId, sender_side: "client", body: input.body });
  await d.from("inbox_read_markers").upsert({ user_id: a.userId, thread_id: t.id, read_at: new Date().toISOString() });
  return { id: t.id as string };
}

export async function reply(a: InboxActor, id: string, body: string) {
  const d = await db();
  const { data: t } = await d.from("inbox_threads").select("*").eq("id", id).maybeSingle();
  const side = t ? canSeeThread(a, t) : null;
  if (!side) throw new Error("That conversation is not available.");
  const now = new Date().toISOString();
  const { error } = await d.from("inbox_messages").insert({ thread_id: id, sender_id: a.userId, sender_side: side, body });
  if (error) throw new Error("Could not send.");
  await d.from("inbox_threads").update({ last_message_at: now }).eq("id", id);
  await d.from("inbox_read_markers").upsert({ user_id: a.userId, thread_id: id, read_at: now });
  return { ok: true };
}

export type DirectKind = "team" | "fund_manager" | "investor";
const FM_ROLES = ["fund_manager", "client_gp", "client_signatory", "client_finance", "client_legal", "client_compliance", "client_readonly"];

/** People a Harmonious staff member can message directly. Staff only; test/demo and blocked people are left out. */
export async function directory(a: InboxActor) {
  if (!a.isStaff) return [];
  const d = await db();
  const [{ data: roles }, { data: fms }] = await Promise.all([
    d.from("user_roles").select("user_id, role").limit(50000),
    d.from("fund_managers").select("user_id").limit(50000),
  ]);
  const byUser = new Map<string, string[]>();
  for (const r of (roles ?? []) as any[]) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), String(r.role)]);
  const fmSet = new Set(((fms ?? []) as any[]).map((r) => r.user_id as string));
  const kindOf = new Map<string, DirectKind>();
  for (const [uid, rs] of byUser) {
    if (staffProfile(rs).isHarmoniousStaff) kindOf.set(uid, "team");
    else if (fmSet.has(uid) || rs.some((r) => FM_ROLES.includes(r))) kindOf.set(uid, "fund_manager");
    else if (rs.includes("investor")) kindOf.set(uid, "investor");
  }
  for (const uid of fmSet) if (!kindOf.has(uid)) kindOf.set(uid, "fund_manager");
  kindOf.delete(a.userId);
  const ids = [...kindOf.keys()];
  if (!ids.length) return [];
  const { data: profs } = await d.from("profiles").select("user_id, legal_name, email, is_test_demo").in("user_id", ids);
  return ((profs ?? []) as any[])
    .filter((p) => !p.is_test_demo)
    .map((p) => ({ userId: p.user_id as string, name: (p.legal_name || p.email || "Unnamed") as string, email: (p.email as string) ?? "", kind: kindOf.get(p.user_id)! }))
    .sort((x, y) => x.name.localeCompare(y.name));
}

export async function startDirect(a: InboxActor, input: { userId: string; subject: string; body: string }) {
  if (!a.isStaff) throw new Error("Only Harmonious team members can start a direct conversation.");
  const person = (await directory(a)).find((p) => p.userId === input.userId);
  if (!person) throw new Error("That person can't be messaged.");
  const d = await db();
  const { data: t, error } = await d.from("inbox_threads").insert({
    client_id: null, channel: "direct", participant_user_id: person.userId, participant_kind: person.kind,
    subject: input.subject, created_by: a.userId, started_side: "harmonious",
  }).select("id").single();
  if (error) throw new Error("Could not start the conversation.");
  await d.from("inbox_messages").insert({ thread_id: t.id, sender_id: a.userId, sender_side: "harmonious", body: input.body });
  await d.from("inbox_read_markers").upsert({ user_id: a.userId, thread_id: t.id, read_at: new Date().toISOString() });
  return { id: t.id as string };
}
