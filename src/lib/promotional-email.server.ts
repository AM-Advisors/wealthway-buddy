import { normalizePromotionalEmail } from "./promotional-email-model";

/** Read all promotional restrictions, not just the row currently on screen. Fail closed on failed reads. */
export async function suppressedPromotionalEmails(db: any, emails: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  const normalized = [...new Set(emails.map(normalizePromotionalEmail).filter(Boolean))];
  for (let i = 0; i < normalized.length; i += 200) {
    const batch = normalized.slice(i, i + 200);
    const [global, contacts] = await Promise.all([
      db.from("email_unsubscribes").select("email").in("email", batch).not("unsubscribed_at", "is", null),
      db.from("crm_contacts").select("id,email,consent").in("email", batch),
    ]);
    if (global.error || contacts.error) throw new Error("Couldn't verify email preferences. Nothing was sent.");
    for (const row of global.data ?? []) out.add(normalizePromotionalEmail(row.email));
    const rows = contacts.data ?? [];
    for (const row of rows) if (row.consent === "unsubscribed") out.add(normalizePromotionalEmail(row.email));
    if (rows.length) {
      const opts = await db.from("sales_channel_optouts").select("contact_id").eq("channel", "email").in("contact_id", rows.map((r: any) => r.id));
      if (opts.error) throw new Error("Couldn't verify email preferences. Nothing was sent.");
      const ids = new Set((opts.data ?? []).map((r: any) => r.contact_id));
      for (const row of rows) if (ids.has(row.id)) out.add(normalizePromotionalEmail(row.email));
    }
  }
  return out;
}

export async function recordPromotionalUnsubscribe(db: any, rawEmail: string) {
  const email = normalizePromotionalEmail(rawEmail);
  if (!email) return;
  const now = new Date().toISOString();
  const global = await db.from("email_unsubscribes").upsert({ email, unsubscribed_at: now }, { onConflict: "email" });
  if (global.error) throw new Error("Couldn't save the email preference. Please retry.");
  const contacts = await db.from("crm_contacts").update({ consent: "unsubscribed", consent_recorded_at: now }).ilike("email", email.replace(/[\\%_]/g, "\\$&"));
  if (contacts.error) throw new Error("Couldn't finish saving the email preference. Please retry.");
  await (await import("./email-flows.server")).onUnsubscribe(email);
}

/** Caller must first authorize the CRM record. Only explicit consent can enter a broadcast audience. */
export async function entitledBroadcastContacts(userId: string, db: any) {
  const { crmActor } = await import("./crm.server");
  const { canSee } = await import("./crm-model");
  const actor = await crmActor(userId);
  let query = db.from("crm_contacts").select("id,email,full_name,consent,scope,offering_id,owner_user_id,archived_at").eq("consent", "opted_in").is("archived_at", null).not("email", "is", null).limit(10000);
  if (!actor.superUser && !actor.viewAll) query = query.eq("owner_user_id", userId);
  const result = await query;
  if (result.error) throw new Error("Couldn't verify audience access.");
  return (result.data ?? []).filter((c: any) => canSee(actor, c));
}