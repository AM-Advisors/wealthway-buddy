/**
 * Read-only cross-client Operations work queue and Client timeline.
 * Gathers from existing tables; every item links to the screen that already
 * handles it. Nothing here approves, files, charges or moves money.
 */
import { nextDeadline, stuckFlags } from "@/lib/fund-health";

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export type QueueItem = {
  id: string;
  type: "task_review" | "close_request" | "payment" | "filing" | "pricing" | "message" | "stuck_fund";
  title: string;
  detail: string;
  clientId: string | null;
  clientName: string | null;
  createdAt: string;
  href: string;
  assignees: string[];
};

export async function workQueue(): Promise<{ items: QueueItem[]; staff: { id: string; name: string }[] }> {
  const d = await db();
  const [tasks, closes, pays, filings, prices, threads, setups, fees, assigns, offerings] = await Promise.all([
    d.from("fund_setup_tasks").select("id, label, status, response, updated_at, setup_id, fund_setups(offering_id, client_id, display_name, legal_fund_name)").in("status", ["review", "submitted", "in_review"]).limit(500),
    d.from("fund_close_requests").select("id, offering_id, client_id, status, created_at").in("status", ["submitted", "in_review"]).limit(500),
    d.from("fund_payments").select("id, client_id, total_cents, payment_method, status, created_at").in("payment_method", ["wire", "ach"]).eq("status", "awaiting_payment").limit(500),
    d.from("fund_close_filings").select("id, offering_id, filing_type, jurisdiction, status, prepared_at, close_request_id").neq("status", "filed").limit(500),
    d.from("pricing_approval_requests").select("id, offering_id, client_id, status, created_at, reason").eq("status", "pending").limit(500),
    d.from("inbox_threads").select("id, client_id, subject, last_message_at, channel").order("last_message_at", { ascending: false }).limit(300),
    d.from("fund_setups").select("id, offering_id, client_id, display_name, legal_fund_name, launch_state, updated_at").neq("launch_state", "launched").limit(500),
    d.from("fund_franchise_fees").select("offering_id, state, due_date, filed_on").is("removed_at", null).is("filed_on", null).limit(2000),
    d.from("client_assignments").select("client_id, staff_user_id").limit(5000),
    d.from("offerings").select("id, name, client_id").limit(5000),
  ]);
  const off = new Map(((offerings.data ?? []) as any[]).map((o) => [o.id, o]));
  const clientIds = new Set<string>();
  const items: QueueItem[] = [];
  const cid = (offeringId: string | null, clientId?: string | null) => clientId ?? (offeringId ? off.get(offeringId)?.client_id ?? null : null);
  const fname = (offeringId: string | null) => (offeringId ? off.get(offeringId)?.name ?? "Fund" : "Fund");

  for (const t of (tasks.data ?? []) as any[]) {
    const s = t.fund_setups ?? {};
    items.push({ id: `task:${t.id}`, type: "task_review", title: `Review answer: ${t.label}`, detail: s.display_name || s.legal_fund_name || fname(s.offering_id), clientId: cid(s.offering_id, s.client_id), clientName: null, createdAt: t.updated_at, href: s.offering_id ? `/ops/fund-setup/${s.offering_id}` : "/ops/fund-setup", assignees: [] });
  }
  for (const c of (closes.data ?? []) as any[]) items.push({ id: `close:${c.id}`, type: "close_request", title: "Close request awaiting approval", detail: fname(c.offering_id), clientId: cid(c.offering_id, c.client_id), clientName: null, createdAt: c.created_at, href: "/ops/close-requests", assignees: [] });
  for (const p of (pays.data ?? []) as any[]) items.push({ id: `pay:${p.id}`, type: "payment", title: `Confirm ${String(p.payment_method).toUpperCase()} receipt`, detail: `$${((p.total_cents ?? 0) / 100).toLocaleString()} · HP-${String(p.id).replace(/-/g, "").slice(0, 8).toUpperCase()}`, clientId: p.client_id, clientName: null, createdAt: p.created_at, href: "/admin/services", assignees: [] });
  for (const f of (filings.data ?? []) as any[]) items.push({ id: `filing:${f.id}`, type: "filing", title: `${f.filing_type === "form_d" ? "Form D" : "State notice"}${f.jurisdiction ? ` (${f.jurisdiction})` : ""} to ${f.status === "prepared" ? "file and record" : "prepare"}`, detail: fname(f.offering_id), clientId: cid(f.offering_id), clientName: null, createdAt: f.prepared_at ?? new Date().toISOString(), href: "/ops/close-requests", assignees: [] });
  for (const p of (prices.data ?? []) as any[]) items.push({ id: `price:${p.id}`, type: "pricing", title: "Below-baseline pricing approval", detail: `${fname(p.offering_id)}${p.reason ? ` · ${p.reason}` : ""}`, clientId: cid(p.offering_id, p.client_id), clientName: null, createdAt: p.created_at, href: "/ops/funds", assignees: [] });

  // Threads whose latest message came from the client side are waiting on Harmonious.
  const threadIds = ((threads.data ?? []) as any[]).map((t) => t.id);
  if (threadIds.length) {
    const { data: msgs } = await d.from("inbox_messages").select("thread_id, sender_side, created_at").in("thread_id", threadIds).order("created_at", { ascending: false }).limit(3000);
    const latest = new Map<string, any>();
    for (const m of (msgs ?? []) as any[]) if (!latest.has(m.thread_id)) latest.set(m.thread_id, m);
    for (const t of (threads.data ?? []) as any[]) {
      const m = latest.get(t.id);
      if (m && m.sender_side !== "staff") items.push({ id: `msg:${t.id}`, type: "message", title: `Reply needed: ${t.subject || "Message"}`, detail: `${t.channel ?? "inbox"} message`, clientId: t.client_id, clientName: null, createdAt: m.created_at, href: "/ops/messages", assignees: [] });
    }
  }

  // Stuck funds: no progress for 7+ days or a deadline within 14 days.
  const feesBy = new Map<string, { date: string; title: string }[]>();
  for (const f of (fees.data ?? []) as any[]) if (f.due_date) feesBy.set(f.offering_id, [...(feesBy.get(f.offering_id) ?? []), { date: f.due_date, title: `${f.state} franchise fee` }]);
  for (const s of (setups.data ?? []) as any[]) {
    const n = s.offering_id ? nextDeadline(feesBy.get(s.offering_id) ?? []) : null;
    const flags = stuckFlags({ lastActivityAt: s.updated_at, nextDeadlineDate: n?.date ?? null });
    if (flags.length) items.push({ id: `stuck:${s.id}`, type: "stuck_fund", title: flags.map((f) => f.label).join(" · "), detail: s.display_name || s.legal_fund_name || fname(s.offering_id), clientId: cid(s.offering_id, s.client_id), clientName: null, createdAt: s.updated_at, href: s.offering_id ? `/ops/fund-setup/${s.offering_id}` : "/ops/fund-setup", assignees: [] });
  }

  for (const i of items) if (i.clientId) clientIds.add(i.clientId);
  const assignBy = new Map<string, string[]>();
  for (const a of (assigns.data ?? []) as any[]) assignBy.set(a.client_id, [...(assignBy.get(a.client_id) ?? []), a.staff_user_id]);
  const staffIds = [...new Set(((assigns.data ?? []) as any[]).map((a) => a.staff_user_id))];
  const [{ data: clients }, { data: profiles }] = await Promise.all([
    clientIds.size ? d.from("clients").select("id, name").in("id", [...clientIds]) : { data: [] },
    staffIds.length ? d.from("profiles").select("user_id, legal_name, email").in("user_id", staffIds) : { data: [] },
  ]);
  const cn = new Map(((clients ?? []) as any[]).map((c) => [c.id, c.name]));
  for (const i of items) { i.clientName = i.clientId ? cn.get(i.clientId) ?? null : null; i.assignees = i.clientId ? assignBy.get(i.clientId) ?? [] : []; }
  items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return { items, staff: ((profiles ?? []) as any[]).map((p) => ({ id: p.user_id, name: p.legal_name || p.email || "Staff" })) };
}

export type TimelineEvent = { at: string; kind: string; title: string; detail: string };

/** Merge events for one client, newest first. */
export function mergeTimeline(groups: TimelineEvent[][], limit = 200): TimelineEvent[] {
  return groups.flat().filter((e) => !!e.at).sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

export async function clientTimeline(clientId: string, before?: string | null): Promise<TimelineEvent[]> {
  const d = await db();
  const cutoff = before ?? new Date(Date.now() + 86_400_000).toISOString();
  const { data: offs } = await d.from("offerings").select("id, name").eq("client_id", clientId);
  const offIds = ((offs ?? []) as any[]).map((o) => o.id);
  const fname = new Map(((offs ?? []) as any[]).map((o) => [o.id, o.name]));
  const { data: members } = await d.from("client_users").select("user_id").eq("client_id", clientId);
  const memberIds = ((members ?? []) as any[]).map((m) => m.user_id);
  const lim = 100;
  const safe = (p: any) => p.then((r: any) => (r.data ?? []) as any[], () => []);
  const [threads, pays, closes, filings, prices, audit, access] = await Promise.all([
    safe(d.from("inbox_threads").select("subject, channel, last_message_at").eq("client_id", clientId).lt("last_message_at", cutoff).order("last_message_at", { ascending: false }).limit(lim)),
    safe(d.from("fund_payments").select("kind, total_cents, status, payment_method, created_at, paid_at").eq("client_id", clientId).lt("created_at", cutoff).order("created_at", { ascending: false }).limit(lim)),
    safe(d.from("fund_close_requests").select("offering_id, status, created_at").eq("client_id", clientId).lt("created_at", cutoff).order("created_at", { ascending: false }).limit(lim)),
    offIds.length ? safe(d.from("fund_close_filings").select("offering_id, filing_type, jurisdiction, status, prepared_at, filed_at").in("offering_id", offIds).limit(lim)) : Promise.resolve([]),
    safe(d.from("pricing_approval_requests").select("offering_id, status, created_at, decided_at").eq("client_id", clientId).lt("created_at", cutoff).limit(lim)),
    safe(d.from("contract_audit_events").select("area, action, target, created_at").eq("client_id", clientId).lt("created_at", cutoff).order("created_at", { ascending: false }).limit(lim)),
    memberIds.length ? safe(d.from("access_audit_events").select("action, scope_type, created_at").in("target_user_id", memberIds).lt("created_at", cutoff).order("created_at", { ascending: false }).limit(lim)) : Promise.resolve([]),
  ]);
  return mergeTimeline([
    threads.map((t: any) => ({ at: t.last_message_at, kind: "Message", title: t.subject || "Message", detail: `${t.channel ?? "inbox"} conversation` })),
    pays.map((p: any) => ({ at: p.paid_at ?? p.created_at, kind: "Payment", title: `${p.kind ?? "Payment"} ${p.status}`, detail: `$${((p.total_cents ?? 0) / 100).toLocaleString()} by ${p.payment_method ?? "card"}` })),
    closes.map((c: any) => ({ at: c.created_at, kind: "Close request", title: `Close request ${String(c.status).replace(/_/g, " ")}`, detail: fname.get(c.offering_id) ?? "Fund" })),
    filings.filter((f: any) => (f.filed_at ?? f.prepared_at ?? "") < cutoff).map((f: any) => ({ at: f.filed_at ?? f.prepared_at, kind: "Filing", title: `${f.filing_type === "form_d" ? "Form D" : "State notice"}${f.jurisdiction ? ` ${f.jurisdiction}` : ""} ${f.status}`, detail: fname.get(f.offering_id) ?? "Fund" })),
    prices.map((p: any) => ({ at: p.decided_at ?? p.created_at, kind: "Approval", title: `Pricing approval ${p.status}`, detail: fname.get(p.offering_id) ?? "Fund" })),
    audit.map((a: any) => ({ at: a.created_at, kind: "Activity", title: `${a.area}: ${a.action}`, detail: a.target ?? "" })),
    access.map((a: any) => ({ at: a.created_at, kind: "Access", title: String(a.action).replace(/_/g, " "), detail: a.scope_type ?? "" })),
  ]);
}
