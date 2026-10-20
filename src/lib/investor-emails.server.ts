import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { onboardingActor, forbid } from "@/lib/investor-onboarding.server";
import { deliveryStatus, type EmailEvent } from "@/lib/investor-emails-model";

// Server-only. Per-investor email history: what was sent, by whom, and what the
// email provider reported back. Shows only provider-reported facts.
const db = () => supabaseAdmin as any;
const BREVO_GATEWAY_URL = "https://connector-gateway.lovable.dev/brevo";

export async function logInvestorEmail(input: {
  onboardingId: string; offeringId: string; kind: string; subject?: string | null; recipient: string;
  messageId?: string | null; sentBy?: string | null; outcome?: "sent" | "failed"; note?: string | null; source?: string; sentAt?: string;
}) {
  const row = {
    onboarding_id: input.onboardingId, offering_id: input.offeringId, kind: input.kind, subject: input.subject ?? null,
    recipient_email: input.recipient.toLowerCase(), message_id: input.messageId ?? null, sent_by: input.sentBy ?? null,
    outcome: input.outcome ?? "sent", note: input.note ?? null, source: input.source ?? "platform", ...(input.sentAt ? { sent_at: input.sentAt } : {}),
  };
  const { error } = await db().from("investor_email_sends").insert(row);
  if (error && !String(error.message).includes("duplicate")) console.error("[investor-emails] log failed", error.message);
}

async function authorize(userId: string, onboardingId: string) {
  const actor = await onboardingActor(userId);
  const { data: row } = await db().from("investor_onboardings").select("id, offering_id, persons(email)").eq("id", onboardingId).maybeSingle();
  if (!row) throw new Error("That investor record was not found.");
  if (!actor.isStaff && !actor.managedOfferingIds.includes(row.offering_id)) forbid("you do not manage that fund.");
  return { actor, row: row as any };
}

async function names(ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const { data } = await db().from("profiles").select("user_id, legal_name, email").in("user_id", ids);
  return new Map(((data ?? []) as any[]).map((p) => [p.user_id, p.legal_name || p.email || "Team member"]));
}

export async function investorEmailHistory(userId: string, onboardingId: string) {
  await authorize(userId, onboardingId);
  const [{ data: sends }, { data: reminders }] = await Promise.all([
    db().from("investor_email_sends").select("*").eq("onboarding_id", onboardingId).order("sent_at", { ascending: false }).limit(100),
    db().from("investor_reminders").select("id, step, sent_by, recipient_email, delivery, delivery_note, created_at").eq("onboarding_id", onboardingId).order("created_at", { ascending: false }).limit(100),
  ]);
  const list = (sends ?? []) as any[];
  const ids = list.map((s) => s.message_id).filter(Boolean);
  const { data: events } = ids.length ? await db().from("email_tracking_events").select("message_id, event, occurred_at, reason").in("message_id", ids) : { data: [] };
  const byMsg = new Map<string, EmailEvent[]>();
  for (const e of (events ?? []) as any[]) byMsg.set(e.message_id, [...(byMsg.get(e.message_id) ?? []), { event: e.event, at: e.occurred_at, reason: e.reason }]);
  const who = await names([...new Set([...list.map((s) => s.sent_by), ...((reminders ?? []) as any[]).map((r) => r.sent_by)].filter(Boolean))]);
  // Older reminders (before receipts were kept) appear once, with no provider report.
  const loggedReminderTimes = list.filter((s) => s.kind === "reminder").map((s) => new Date(s.sent_at).getTime());
  const legacy = ((reminders ?? []) as any[]).filter((r) => !loggedReminderTimes.some((t) => Math.abs(t - new Date(r.created_at).getTime()) < 120_000));
  const items = [
    ...list.map((s) => ({
      id: s.id, kind: s.kind, subject: s.subject, recipient: s.recipient_email, sentAt: s.sent_at, sentBy: s.sent_by ? who.get(s.sent_by) ?? "Team member" : "Harmonious",
      source: s.source, status: s.outcome === "failed" ? { label: "Not sent", tone: "bad" as const, detail: s.note } : deliveryStatus(byMsg.get(s.message_id) ?? []),
    })),
    ...legacy.map((r) => ({
      id: r.id, kind: "reminder", subject: `Reminder: ${String(r.step).replace(/_/g, " ")}`, recipient: r.recipient_email, sentAt: r.created_at, sentBy: who.get(r.sent_by) ?? "Team member",
      source: "platform", status: r.delivery === "failed" ? { label: "Not sent", tone: "bad" as const, detail: r.delivery_note } : { label: "No delivery report yet", tone: "neutral" as const, detail: "Sent before delivery receipts were kept. Use Check delivery." },
    })),
  ].sort((a, b) => String(b.sentAt).localeCompare(String(a.sentAt)));
  return { items };
}

/** Pull this investor's email events from the provider (last 30 days), store them, and record the lookup. */
export async function lookupProviderDeliveries(userId: string, onboardingId: string) {
  const { actor, row } = await authorize(userId, onboardingId);
  const email = String(row.persons?.email ?? "").trim().toLowerCase();
  if (!email) throw new Error("This investor has no email on file.");
  const apiKey = process.env["LOVABLE_API_KEY"]; const brevoKey = process.env["BREVO_API_KEY"];
  if (!apiKey || !brevoKey) throw new Error("Email delivery lookup is not configured.");
  const end = new Date(); const start = new Date(end.getTime() - 29 * 86_400_000);
  const qs = new URLSearchParams({ email, startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10), limit: "200", sort: "desc" });
  const res = await fetch(`${BREVO_GATEWAY_URL}/smtp/statistics/events?${qs}`, { headers: { Authorization: `Bearer ${apiKey}`, "X-Connection-Api-Key": brevoKey } });
  if (!res.ok) { const body = await res.text(); console.error(`[investor-emails] lookup failed [${res.status}]: ${body}`); throw new Error(`Email provider lookup failed [${res.status}]`); }
  const events = (((await res.json()) as any).events ?? []) as any[];
  // Only messages about this fund's investment/reminders; other emails to this address stay out.
  const { data: fund } = await db().from("offerings").select("name").eq("id", row.offering_id).maybeSingle();
  const fundName = String(fund?.name ?? "");
  const relevant = events.filter((e) => typeof e.messageId === "string" && fundName && String(e.subject ?? "").includes(fundName));
  const firstSeen = new Map<string, any>();
  for (const e of relevant) { const cur = firstSeen.get(e.messageId); if (!cur || e.date < cur.date) firstSeen.set(e.messageId, e); }
  let added = 0;
  for (const e of relevant) {
    const dedupe = `${e.messageId}|${e.event}|${Math.floor(new Date(e.date).getTime() / 1000)}|${e.link ?? ""}`;
    const ev = e.event === "requests" ? "request" : e.event === "hardBounces" ? "hard_bounce" : e.event === "softBounces" ? "soft_bounce" : e.event === "clicks" ? "click" : e.event;
    const { error } = await db().from("email_tracking_events").insert({ message_id: e.messageId, event: ev, occurred_at: new Date(e.date).toISOString(), dedupe_key: dedupe, reason: typeof e.reason === "string" ? e.reason.slice(0, 300) : null });
    if (!error) added++;
  }
  const { data: known } = await db().from("investor_email_sends").select("message_id").eq("onboarding_id", onboardingId).not("message_id", "is", null);
  const knownIds = new Set(((known ?? []) as any[]).map((k) => k.message_id));
  for (const [mid, e] of firstSeen) {
    if (knownIds.has(mid)) continue;
    await logInvestorEmail({ onboardingId, offeringId: row.offering_id, kind: e.tag === "investment-onboarding" ? "invitation" : e.tag === "investor-message" ? "reminder" : "message", subject: e.subject ?? null, recipient: email, messageId: mid, source: "provider_lookup", sentAt: new Date(e.date).toISOString() });
  }
  await db().from("investor_onboarding_events").insert({ onboarding_id: onboardingId, offering_id: row.offering_id, event: "email_delivery_lookup", detail: { messages: firstSeen.size, newEvents: added }, actor_user_id: actor.userId, actor_role: actor.isStaff ? "harmonious" : "manager" });
  return { messages: firstSeen.size, newEvents: added };
}
