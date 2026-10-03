/**
 * Read-only Account Management projections (dashboard, hand-offs, renewals).
 * Scoped to the caller's assigned clients; leadership sees all. Never writes.
 */
import { seesWholeTeam } from "@/lib/staff-role-hierarchy";
import { clientHealth } from "@/lib/account-health";

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
const DAY = 864e5;

async function scope(userId: string) {
  const db = await admin();
  const { data: r } = await db.from("user_roles").select("role").eq("user_id", userId);
  const roles = ((r ?? []) as any[]).map((x) => String(x.role));
  const team = seesWholeTeam(roles) || roles.includes("executive") || roles.includes("leadership");
  if (!team && !roles.some((x) => ["account_manager", "client_success"].includes(x))) throw new Error("Account Management access only.");
  let clientIds: string[] | null = null;
  if (!team) {
    const [{ data: a }, { data: b }] = await Promise.all([
      db.from("client_team_assignments").select("client_id").eq("user_id", userId),
      db.from("client_assignments").select("client_id").eq("staff_user_id", userId),
    ]);
    clientIds = [...new Set([...((a ?? []) as any[]), ...((b ?? []) as any[])].map((x) => x.client_id))];
  }
  return { db, team, clientIds };
}

function scoped(q: any, ids: string[] | null, col = "client_id") {
  return ids ? q.in(col, ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]) : q;
}

export async function amDashboard(userId: string) {
  const { db, team, clientIds } = await scope(userId);
  const [clients, offers, setups, invoices, requests, threads, quotes, sows] = await Promise.all([
    scoped(db.from("clients").select("id, name, legal_name, updated_at").not("is_test_demo", "is", true).neq("status", "archived"), clientIds, "id").limit(2000),
    scoped(db.from("offerings").select("id, client_id, name"), clientIds).limit(5000),
    scoped(db.from("fund_setups").select("offering_id, client_id, launch_state, stage, updated_at"), clientIds).limit(5000),
    scoped(db.from("invoices").select("id, client_id, status, due_date, total_cents, paid_on, voided_at"), clientIds).is("paid_on", null).is("voided_at", null).limit(5000),
    scoped(db.from("service_requests").select("id, client_id, service_key, status, created_at"), clientIds).not("status", "in", "(activated,declined,withdrawn)").limit(2000),
    scoped(db.from("inbox_threads").select("id, client_id, subject, last_message_at"), clientIds).order("last_message_at", { ascending: false }).limit(500),
    scoped(db.from("sales_quotes").select("id, client_id, quote_number, title, signed_at, onboarded_at, onboarded_offering_id, total_cents"), clientIds).eq("status", "signed").gte("signed_at", new Date(Date.now() - 30 * DAY).toISOString()).limit(500),
    scoped(db.from("client_sows").select("id, client_id, title, termination_date, status"), clientIds).not("termination_date", "is", null).limit(2000),
  ]);
  const C = (clients.data ?? []) as any[], O = (offers.data ?? []) as any[], S = (setups.data ?? []) as any[];
  const I = ((invoices.data ?? []) as any[]).filter((i) => !["draft", "paid", "void"].includes(String(i.status)));
  const R = (requests.data ?? []) as any[], T = (threads.data ?? []) as any[];
  // Messages whose last word came from the client side are "waiting".
  const tIds = T.map((t) => t.id);
  const { data: last } = tIds.length ? await db.from("inbox_messages").select("thread_id, sender_side, created_at").in("thread_id", tIds).order("created_at", { ascending: false }).limit(3000) : { data: [] };
  const lastSide = new Map<string, string>();
  for (const m of (last ?? []) as any[]) if (!lastSide.has(m.thread_id)) lastSide.set(m.thread_id, m.sender_side);
  const waiting = T.filter((t) => lastSide.get(t.id) === "client");
  const today = new Date().toISOString().slice(0, 10);
  const name = new Map(C.map((c) => [c.id, c.legal_name || c.name]));

  const book = C.map((c) => {
    const setupsFor = S.filter((s) => s.client_id === c.id);
    const stuck = setupsFor.filter((s) => s.launch_state !== "launched" && Date.now() - new Date(s.updated_at).getTime() > 21 * DAY).length;
    const lastTouch = [c.updated_at, ...setupsFor.map((s) => s.updated_at), ...T.filter((t) => t.client_id === c.id).map((t) => t.last_message_at)].filter(Boolean).sort().pop();
    const h = clientHealth({
      stuckFunds: stuck,
      overdueInvoices: I.filter((i) => i.client_id === c.id && i.due_date && i.due_date < today).length,
      unansweredMessages: waiting.filter((t) => t.client_id === c.id).length,
      openRequests: R.filter((r) => r.client_id === c.id).length,
      daysSinceActivity: lastTouch ? Math.floor((Date.now() - new Date(lastTouch).getTime()) / DAY) : null,
    });
    return { clientId: c.id, name: name.get(c.id) ?? "Client", funds: O.filter((o) => o.client_id === c.id).length, inSetup: setupsFor.filter((s) => s.launch_state !== "launched").length, ...h };
  }).sort((a, b) => ["At risk", "Needs attention", "Healthy"].indexOf(a.health) - ["At risk", "Needs attention", "Healthy"].indexOf(b.health) || a.name.localeCompare(b.name));

  const stageCounts: Record<string, number> = {};
  for (const s of S) { const k = s.launch_state === "launched" ? "Launched" : String(s.stage ?? s.launch_state ?? "Setup").replace(/_/g, " "); stageCounts[k] = (stageCounts[k] ?? 0) + 1; }
  const soon = new Date(Date.now() + 90 * DAY).toISOString().slice(0, 10);
  return {
    team,
    totals: { clients: C.length, activeFunds: S.filter((s) => s.launch_state === "launched").length, inSetup: S.filter((s) => s.launch_state !== "launched").length, unpaidInvoices: I.length, unpaidCents: I.reduce((t, i) => t + Number(i.total_cents ?? 0), 0), openRequests: R.length },
    book,
    healthCounts: { Healthy: book.filter((b) => b.health === "Healthy").length, "Needs attention": book.filter((b) => b.health === "Needs attention").length, "At risk": book.filter((b) => b.health === "At risk").length },
    stageCounts,
    handoffs: ((quotes.data ?? []) as any[]).map((q) => {
      const st = S.find((s) => s.offering_id === q.onboarded_offering_id);
      return { id: q.id, client: name.get(q.client_id) ?? "Client", clientId: q.client_id, quote: `Q-${q.quote_number}`, title: q.title, signedAt: q.signed_at, cents: Number(q.total_cents ?? 0), fundId: q.onboarded_offering_id, handedOff: !!q.onboarded_at, setupStarted: !!st && st.launch_state !== "not_ready" };
    }),
    renewals: ((sows.data ?? []) as any[]).filter((s) => s.termination_date >= today && s.termination_date <= soon)
      .map((s) => ({ id: s.id, client: name.get(s.client_id) ?? "Client", clientId: s.client_id, title: s.title, ends: s.termination_date, days: Math.ceil((new Date(s.termination_date).getTime() - Date.now()) / DAY) }))
      .sort((a, b) => a.ends.localeCompare(b.ends)),
    waiting: [
      ...waiting.slice(0, 15).map((t) => ({ kind: "Message", id: t.id, client: name.get(t.client_id) ?? "Client", title: t.subject, at: t.last_message_at })),
      ...R.slice(0, 15).map((r) => ({ kind: "Service request", id: r.id, client: name.get(r.client_id) ?? "Client", title: String(r.service_key).replace(/_/g, " "), at: r.created_at })),
    ].sort((a, b) => String(b.at).localeCompare(String(a.at))),
  };
}
