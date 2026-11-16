/**
 * A fund's Initial Contact: the client's person Harmonious reaches first while a
 * fund is being set up (often before any fund manager has a login). It is a
 * descriptive client_contact_scopes role on one Client Contact and grants no
 * access, signing authority or fund manager rights.
 */
import { isHarmoniousStaffEmail } from "@/lib/harmonious-staff";

export const INITIAL_CONTACT_ROLE = "initial_contact" as const;

export type InitialContactDraft = { fullName: string; email?: string | null | undefined; phone?: string | null | undefined; title?: string | null | undefined };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Plain-language problem with a new contact, or null when it can be saved. */
export function initialContactProblem(d: InitialContactDraft): string | null {
  if (!d.fullName.trim()) return "Enter the contact's name.";
  const email = (d.email ?? "").trim();
  if (email && !EMAIL.test(email)) return "That email doesn't look right.";
  if (isHarmoniousStaffEmail(email)) return "Harmonious staff can't be a fund's initial contact. Add someone from the client.";
  if (!email && !(d.phone ?? "").trim()) return "Add an email or phone so we can reach them.";
  return null;
}
