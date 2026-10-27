import { normalizePromotionalEmail, promotionalEmailAllowed } from "./promotional-email-model";

/** Read all promotional restrictions, not just the row currently on screen. Fail closed on failed reads. */
export async function suppressedPromotionalEmails(db: any, emails: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  const normalized = [...new Set(emails.map(normalizePromotionalEmail).filter(Boolean))];
  for (let i = 0; i < normalized.length; i += 200) {
    const batch = normalized.slice(i, i + 200);
    const result = await db.rpc("promotional_suppressed_emails", { _emails: batch });
    if (result.error) throw new Error("Couldn't verify email preferences. Nothing was sent.");
    for (const row of result.data ?? []) out.add(normalizePromotionalEmail(row.email));
  }
  return out;
}

export async function recordPromotionalUnsubscribe(db: any, rawEmail: string) {
  const email = normalizePromotionalEmail(rawEmail);
  if (!email) return;
  const result = await db.rpc("record_promotional_unsubscribe", { _email: email });
  if (result.error) throw new Error("Couldn't save the email preference. Please retry.");
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
  return (result.data ?? []).filter((c: any) => canSee(actor, c) && promotionalEmailAllowed({ consent: c.consent, suppressed: false, archived: !!c.archived_at, bulk: true }));
}