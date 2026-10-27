import { importContactDecision } from "./crm-import-contact-model";
export async function importedContact(db: any, source: string, externalId: string, email: string | null) {
  const [link, legacy] = await Promise.all([
    db.from("crm_contact_source_links").select("contact_id").eq("external_source", source).eq("external_id", externalId).maybeSingle(),
    db.from("crm_contacts").select("id").eq("external_source", source).eq("external_id", externalId).maybeSingle(),
  ]);
  if (link.error || legacy.error) throw new Error("Couldn't verify imported contact linkage.");
  const linkedId = link.data?.contact_id ?? legacy.data?.id ?? null;
  if (linkedId || !email) return importContactDecision(linkedId, []);
  const result = await db.from("crm_contacts").select("id,full_name,email").eq("scope", "harmonious").ilike("email", email.trim().replace(/[\\%_]/g, "\\$&")).is("archived_at", null).limit(2);
  if (result.error) throw new Error("Couldn't check existing imported contacts.");
  return importContactDecision(null, result.data ?? []);
}