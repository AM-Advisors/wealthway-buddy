/**
 * Staff-only Fund Manager page: details, assigned funds and inbox for a fund's
 * manager, whether or not they have signed in. Read-only except for staff
 * messages, which are addressed to the manager's email and become visible to
 * them once they sign in.
 */
import { inboxActor } from "@/lib/inbox.server";

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export async function assertOpsStaff(userId: string) {
  const a = await inboxActor(userId);
  if (!a.isStaff || !(a.ops || a.isAdmin)) throw new Error("Only Harmonious Operations can open this page.");
  return a;
}

export type ManagerCandidate = {
  key: string; // u:<userId> | t:<teamMemberId> | c:<contactId>
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  source: "signed_in" | "fund_team" | "client_contact";
  signedIn: boolean;
};

const lc = (s: string | null | undefined) => (s ?? "").trim().toLowerCase() || null;

export async function managerCandidates(fundId: string) {
  const d = await db();
  const { data: fund } = await d.from("offerings").select("id, name, client_id").eq("id", fundId).maybeSingle();
  if (!fund) throw new Error("Fund not found.");
  const [{ data: fm }, { data: team }, { data: contacts }, { data: client }] = await Promise.all([
    d.from("fund_managers").select("user_id").eq("offering_id", fundId),
    d.from("fund_team_members").select("id, full_name, email, phone, company, team_role").eq("offering_id", fundId).is("removed_at", null).in("team_role", ["gp", "manager"]),
    fund.client_id ? d.from("client_contacts").select("id, full_name, email, phone, title, user_id, is_primary, deactivated_at").eq("client_id", fund.client_id).is("deactivated_at", null) : { data: [] },
    fund.client_id ? d.from("clients").select("id, name").eq("id", fund.client_id).maybeSingle() : { data: null },
  ]);
  const userIds = ((fm ?? []) as any[]).map((r) => r.user_id);
  const { data: profs } = userIds.length ? await d.from("profiles").select("user_id, legal_name, email, phone").in("user_id", userIds) : { data: [] };
  const out: ManagerCandidate[] = [];
  const seen = new Set<string>();
  for (const p of (profs ?? []) as any[]) {
    out.push({ key: `u:${p.user_id}`, name: p.legal_name || p.email || "Fund manager", email: lc(p.email), phone: p.phone ?? null, title: "Fund manager", source: "signed_in", signedIn: true });
    if (lc(p.email)) seen.add(lc(p.email)!);
  }
  for (const t of (team ?? []) as any[]) {
    if (lc(t.email) && seen.has(lc(t.email)!)) continue;
    out.push({ key: `t:${t.id}`, name: t.full_name, email: lc(t.email), phone: t.phone ?? null, title: t.team_role === "gp" ? "Manager / GP" : "Manager", source: "fund_team", signedIn: false });
    if (lc(t.email)) seen.add(lc(t.email)!);
  }
  const sorted = [...((contacts ?? []) as any[])].sort((a, b) => Number(!!b.is_primary) - Number(!!a.is_primary));
  for (const c of sorted) {
    if (lc(c.email) && seen.has(lc(c.email)!)) continue;
    out.push({ key: `c:${c.id}`, name: c.full_name, email: lc(c.email), phone: c.phone ?? null, title: c.title || (c.is_primary ? "Primary contact" : "Client contact"), source: "client_contact", signedIn: !!c.user_id });
    if (lc(c.email)) seen.add(lc(c.email)!);
  }
  return { fund: { id: fund.id as string, name: fund.name as string, clientId: (fund.client_id as string) ?? null, clientName: (client as any)?.name ?? null }, candidates: out };
}

export async function managerProfile(fundId: string, key: string | null) {
  const d = await db();
  const base = await managerCandidates(fundId);
  const m = base.candidates.find((c) => c.key === key) ?? base.candidates[0] ?? null;
  if (!m) return { ...base, manager: null, funds: [], threads: [] };

  // Assigned funds: signed-in assignments, team-member rows by email, and the client's funds.
  const fundIds = new Set<string>([fundId]);
  let userId: string | null = m.key.startsWith("u:") ? m.key.slice(2) : null;
  if (!userId && m.email) {
    const { data: p } = await d.from("profiles").select("user_id").ilike("email", m.email).maybeSingle();
    userId = (p as any)?.user_id ?? null;
  }
  if (userId) for (const r of ((await d.from("fund_managers").select("offering_id").eq("user_id", userId)).data ?? []) as any[]) fundIds.add(r.offering_id);
  if (m.email) for (const r of ((await d.from("fund_team_members").select("offering_id").ilike("email", m.email).is("removed_at", null)).data ?? []) as any[]) fundIds.add(r.offering_id);
  if (m.source === "client_contact" && base.fund.clientId) for (const r of ((await d.from("offerings").select("id").eq("client_id", base.fund.clientId)).data ?? []) as any[]) fundIds.add(r.id);
  const { data: offs } = await d.from("offerings").select("id, name, status, client_id").in("id", [...fundIds]).order("name");

  // Inbox: conversations this person started, or that Harmonious addressed to them.
  const clientIds = [...new Set(((offs ?? []) as any[]).map((o) => o.client_id).filter(Boolean))] as string[];
  let threads: any[] = [];
  if (clientIds.length && (userId || m.email)) {
    const ors: string[] = [];
    if (userId) ors.push(`created_by.eq.${userId}`);
    if (m.email && /^[^,()"\s]+$/.test(m.email)) ors.push(`addressed_email.ilike.${m.email}`);
    const { data } = await d.from("inbox_threads").select("*").in("client_id", clientIds).or(ors.join(",")).order("last_message_at", { ascending: false }).limit(100);
    threads = ((data ?? []) as any[]).filter((t) => t.created_by === userId || lc(t.addressed_email) === m.email);
  }
  const ids = threads.map((t) => t.id);
  const { data: msgs } = ids.length ? await d.from("inbox_messages").select("thread_id, sender_id, sender_side, body, created_at").in("thread_id", ids).order("created_at") : { data: [] };
  const senders = [...new Set(((msgs ?? []) as any[]).map((x) => x.sender_id))];
  const { data: sp } = senders.length ? await d.from("profiles").select("user_id, legal_name, email").in("user_id", senders) : { data: [] };
  const sn = new Map(((sp ?? []) as any[]).map((p) => [p.user_id, p.legal_name || p.email || ""]));
  return {
    ...base,
    manager: { ...m, signedIn: m.signedIn || !!userId },
    funds: ((offs ?? []) as any[]).map((o) => ({ id: o.id as string, name: o.name as string, status: (o.status as string) ?? null })),
    threads: threads.map((t) => ({
      id: t.id as string, subject: t.subject as string, channel: t.channel as string, lastMessageAt: t.last_message_at as string,
      startedBy: t.started_side === "harmonious" ? "Harmonious" : "Fund manager",
      messages: ((msgs ?? []) as any[]).filter((x) => x.thread_id === t.id).map((x) => ({ side: x.sender_side as string, body: x.body as string, at: x.created_at as string, sender: sn.get(x.sender_id) ?? "" })),
    })),
  };
}

/** Staff message to a fund manager. Stored only; no email is sent. */
export async function staffMessageManager(staffUserId: string, input: { fundId: string; key: string; subject: string; body: string }) {
  const d = await db();
  const base = await managerCandidates(input.fundId);
  const m = base.candidates.find((c) => c.key === input.key);
  if (!m) throw new Error("That person is not a manager of this fund.");
  if (!m.email) throw new Error("Add an email for this person before messaging them.");
  if (!base.fund.clientId) throw new Error("This fund is not linked to a client company yet.");
  const now = new Date().toISOString();
  const { data: t, error } = await d.from("inbox_threads").insert({
    client_id: base.fund.clientId, channel: "operations", rep_user_id: null, subject: input.subject,
    created_by: staffUserId, addressed_email: m.email, started_side: "harmonious", last_message_at: now,
  }).select("id").single();
  if (error) throw new Error("Could not start the conversation.");
  const { error: e2 } = await d.from("inbox_messages").insert({ thread_id: t.id, sender_id: staffUserId, sender_side: "harmonious", body: input.body });
  if (e2) throw new Error("Could not send.");
  await d.from("inbox_read_markers").upsert({ user_id: staffUserId, thread_id: t.id, read_at: now });
  return { id: t.id as string };
}
