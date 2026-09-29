/**
 * Client Contacts (Phase 3.10B) — pure rules. Primary Contact is a designation
 * on one Contact; new rows are matched to existing Client contacts through the
 * canonical Person Resolution rules so nobody is created twice.
 */
import { resolvePerson } from "@/lib/person-resolution";

export type ContactRow = { id?: string; full_name: string; email?: string | null; phone?: string | null; title?: string | null; designations: string[] };
export type ExistingContact = { id: string; full_name: string; email: string | null; designations: string[] | null };

const split = (n: string) => {
  const t = n.trim().replace(/\s+/g, " ");
  const i = t.indexOf(" ");
  return i < 0 ? { first: t, last: "" } : { first: t.slice(0, i), last: t.slice(i + 1) };
};
const asCandidate = (c: ExistingContact) => ({ id: c.id, email: c.email, firstName: split(c.full_name).first, lastName: split(c.full_name).last });

export type ContactPlan = { rows: ContactRow[]; deactivate: string[]; linked: number; error: string | null };

export function planContactSave(existing: readonly ExistingContact[], incoming: readonly ContactRow[], confirmedSeparate: readonly number[] = []): ContactPlan {
  if (incoming.filter((c) => c.designations.includes("Primary")).length > 1) {
    return { rows: [], deactivate: [], linked: 0, error: "Only one contact can be the Primary Contact." };
  }
  const claimed = new Set(incoming.map((c) => c.id).filter(Boolean) as string[]);
  let linked = 0;
  const rows: ContactRow[] = [];
  for (let i = 0; i < incoming.length; i++) {
    const c = incoming[i]!;
    if (c.id) { rows.push(c); continue; }
    const free = existing.filter((e) => !claimed.has(e.id));
    const n = split(c.full_name);
    const r = resolvePerson({ email: c.email ?? null, firstName: n.first, lastName: n.last }, free.map(asCandidate));
    if (r.outcome === "exact_match" && r.personId) {
      const match = existing.find((e) => e.id === r.personId)!;
      claimed.add(match.id);
      linked += 1;
      rows.push({ ...c, id: match.id, designations: [...new Set([...(match.designations ?? []), ...c.designations])] });
      continue;
    }
    if (r.outcome !== "no_match" && !confirmedSeparate.includes(i)) {
      return { rows: [], deactivate: [], linked: 0, error: `Contact Review Required: "${c.full_name}" may already be a contact for this client. Edit the existing contact, or confirm this is a separate person.` };
    }
    rows.push(c);
  }
  const deactivate = existing.filter((e) => !claimed.has(e.id)).map((e) => e.id);
  return { rows, deactivate, linked, error: null };
}

/** Legacy Client primary_contact_* values with no matching Primary Contact → Contact Review Required. */
export function legacyPrimaryStatus(client: { primary_contact_name: string | null; primary_contact_email: string | null }, contacts: readonly ExistingContact[]):
  { status: "linked" | "none" | "review"; matchId: string | null } {
  if (!client.primary_contact_name && !client.primary_contact_email) return { status: "none", matchId: null };
  const primary = contacts.find((c) => (c.designations ?? []).includes("Primary"));
  const email = (client.primary_contact_email ?? "").trim().toLowerCase();
  if (primary && (!email || (primary.email ?? "").toLowerCase() === email)) return { status: "linked", matchId: primary.id };
  const n = split(client.primary_contact_name ?? "");
  const r = resolvePerson({ email, firstName: n.first, lastName: n.last }, contacts.map(asCandidate));
  return r.outcome === "exact_match" ? { status: "review", matchId: r.personId } : { status: "review", matchId: null };
}
