/**
 * One shared "please sign" reminder: opens the exact document. People who have never signed in
 * get their personal one-time invite link (set password, then land on the document).
 * At most one reminder per document per signer per 24h; Super Admins may override with a logged reason.
 * Never signs, files or sends anything else.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { PORTAL_ORIGIN } from "@/lib/account-invite.server";

const DAY = 86400_000;

export async function sendSigningReminder(actorId: string, input: {
  offeringId?: string | null; clientId?: string | null; contextName?: string | null; reminderKey: string; documentTitle: string; recipientEmail: string; recipientName: string;
  recipientUserId?: string | null; path: string; steps: string[]; override?: { reason: string } | null;
}) {
  const d = supabaseAdmin as any;
  const since = new Date(Date.now() - DAY).toISOString();
  const { data: recent } = input.offeringId ? await d.from("offering_audit_events").select("created_at, changes").eq("offering_id", input.offeringId).eq("event_type", "signing_reminder_sent").gte("created_at", since).order("created_at", { ascending: false }).limit(200) : { data: [] };
  const { data: recentKey } = await d.from("document_reminders").select("id").eq("reminder_key", input.reminderKey).eq("delivered", true).gte("created_at", since).limit(1);
  const hit = ((recent ?? []) as any[]).find((e) => (e.changes ?? []).some((c: any) => c.field === "Reminder key" && c.to === input.reminderKey)) ?? (recentKey ?? [])[0];
  if (hit) {
    if (!input.override?.reason?.trim()) throw new Error("A reminder for this was already sent in the last 24 hours.");
    const { data: sa } = await d.from("user_roles").select("role").eq("user_id", actorId).eq("role", "super_admin").maybeSingle();
    if (!sa) throw new Error("A reminder for this was already sent in the last 24 hours. Only a Super Admin can send another today.");
  }
  // Never signed in -> personal invite link that returns to the document after the password is set.
  let userId = input.recipientUserId ?? null;
  if (!userId) { const { data: p } = await d.from("profiles").select("user_id").ilike("email", input.recipientEmail).maybeSingle(); userId = p?.user_id ?? null; }
  let firstTime = false;
  let ctaUrl = `${PORTAL_ORIGIN}${input.path}`;
  if (userId) {
    const { data: u } = await d.auth.admin.getUserById(userId);
    if (!u?.user?.last_sign_in_at) {
      const { setPasswordLink } = await import("@/lib/account-invite.server");
      const link = await setPasswordLink(d, input.recipientEmail, actorId);
      if (link.includes("/invite/")) { ctaUrl = `${link}?next=${encodeURIComponent(input.path)}`; firstTime = true; }
    }
  }
  const { data: o } = input.offeringId ? await d.from("offerings").select("name").eq("id", input.offeringId).maybeSingle() : { data: null };
  const { data: me } = await d.from("profiles").select("legal_name").eq("user_id", actorId).maybeSingle();
  const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
  const { secondaryCcFor } = await import("@/lib/person-emails.server");
  const secondary = await secondaryCcFor(input.recipientEmail);
  const r: any = await sendTemplateEmail("signing-reminder", input.recipientEmail, {
    cc: secondary ? ["operations@harmonious.co", secondary] : "operations@harmonious.co", inboxForAnyUser: true,
    templateData: { recipientName: input.recipientName.split(/\s+/)[0] || "there", documentTitle: input.documentTitle, fundName: input.contextName ?? o?.name ?? "your fund", steps: input.steps, requestedBy: me?.legal_name ?? undefined, ctaUrl, firstTime },
  });
  const sent = r?.sent !== false;
  await d.from("document_reminders").insert({ reminder_key: input.reminderKey, client_id: input.clientId ?? null, offering_id: input.offeringId ?? null, document_title: input.documentTitle, recipient_email: input.recipientEmail, sent_by: actorId, delivered: sent, override_reason: hit ? input.override?.reason ?? null : null, message_id: r?.messageId ?? null, inbox_message_id: r?.inboxMessageId ?? null, recipient_user_id: userId });
  const { logFundAudit } = await import("@/lib/fund-audit.server");
  if (input.offeringId) await logFundAudit(actorId, {
    offeringId: input.offeringId!, eventType: "signing_reminder_sent",
    summary: `${sent ? "Signing reminder sent" : "Signing reminder could not be delivered"} to ${input.recipientName} (${input.recipientEmail}) for ${input.documentTitle}${hit ? " — Super Admin override" : ""}`,
    values: { reminderKey: input.reminderKey, document: input.documentTitle, recipient: input.recipientEmail, link: firstTime ? "Personal set-password link" : "Direct link", ...(hit ? { overrideReason: input.override?.reason } : {}) },
  });
  if (!sent) throw new Error("The reminder couldn't be delivered to that email address.");
  return { sent: true, firstTime, recipientEmail: input.recipientEmail };
}

/** Latest reminder time per reminder key for a fund (for "Last reminded" labels). */
export async function lastReminders(offeringId: string) {
  const { data } = await (supabaseAdmin as any).from("offering_audit_events").select("created_at, changes").eq("offering_id", offeringId).eq("event_type", "signing_reminder_sent").order("created_at", { ascending: false }).limit(300);
  const out: Record<string, string> = {};
  for (const e of (data ?? []) as any[]) { const k = (e.changes ?? []).find((c: any) => c.field === "Reminder key")?.to; if (k && !out[k]) out[k] = e.created_at; }
  return out;
}

/** Latest delivered reminder time per key (any scope). */
export async function lastRemindersByKeys(keys: string[]) {
  if (!keys.length) return {} as Record<string, string>;
  const { data } = await (supabaseAdmin as any).from("document_reminders").select("reminder_key, created_at").in("reminder_key", keys).eq("delivered", true).order("created_at", { ascending: false }).limit(500);
  const out: Record<string, string> = {};
  for (const r of (data ?? []) as any[]) if (!out[r.reminder_key]) out[r.reminder_key] = r.created_at;
  return out;
}
