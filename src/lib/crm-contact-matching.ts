import { canSee, type CrmActor, type Owned } from "./crm-model";
export const contactEmailKey = (email: string | null | undefined) => email?.trim().toLowerCase() || null;
type Contact = Owned & { id: string; email?: string | null; archived_at?: string | null; created_at?: string; tags?: string[]; consent?: string };
export function matchingVisibleContacts<T extends Contact>(actor: CrmActor, contact: T, rows: T[]) {
  const key = contactEmailKey(contact.email);
  return rows.filter(row => canSee(actor, row) && (row.id === contact.id || (!row.archived_at && key && contactEmailKey(row.email) === key && row.scope === contact.scope && row.offering_id === contact.offering_id)));
}
export function groupVisibleContacts<T extends Contact>(actor: CrmActor, rows: T[]) {
  const groups = new Map<string, T[]>();
  for (const row of rows.filter(r => canSee(actor, r))) {
    const key = !row.archived_at && contactEmailKey(row.email) ? `${row.scope}:${row.offering_id ?? ""}:${contactEmailKey(row.email)}` : row.id;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()].map(group => {
    const sorted = [...group].sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? "") || a.id.localeCompare(b.id));
    const first = sorted[0];
    if (!first) throw new Error("Empty contact group.");
    return { ...first, matchedContactIds: sorted.map(r => r.id), tags: [...new Set(sorted.flatMap(r => r.tags ?? []))], consent: sorted.some(r => r.consent === "unsubscribed") ? "unsubscribed" : first.consent };
  });
}
/** Additional sources fill blanks only; never erase staff-maintained contact details. */
export function importedContactFields(stored: Record<string, any>, incoming: Record<string, any>, source: string) {
  if (stored['external_source'] === source) return incoming;
  return Object.fromEntries(Object.entries(incoming).filter(([key, value]) => key === "updated_at" || key === "consent" || key.startsWith("consent_") || (!stored[key] && value)));
}