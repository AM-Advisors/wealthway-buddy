import { canSee, type CrmActor, type Owned } from "@/lib/crm-model";

export function companyContacts<T extends Owned & { company_id: string | null }>(actor: CrmActor, companyId: string, contacts: T[]): T[] {
  return contacts.filter((contact) => contact.company_id === companyId && canSee(actor, contact));
}

export function contactFields(d: { full_name: string; email?: string | null | undefined; phone?: string | null | undefined; title?: string | null | undefined; organization?: string | null | undefined; source?: string | null | undefined; tags?: string[] | undefined }) {
  return { full_name: d.full_name.trim(), email: d.email?.trim().toLowerCase() || null, phone: d.phone?.trim() || null, title: d.title?.trim() || null, organization: d.organization?.trim() || null, source: d.source?.trim() || null, tags: d.tags ?? [] };
}