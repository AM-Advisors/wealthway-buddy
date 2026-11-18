/**
 * Connected email correction (pure). One person's email appears on their login,
 * person record, client contacts, fund team entries, open invitations and other
 * live contact rows. A correction updates every live place together so nothing
 * stays split across account, fund and client. Sent emails, signatures,
 * accepted invitations and audit history keep the address they were made with.
 */

export const normalizeEmail = (v: string | null | undefined): string => (v ?? "").trim().toLowerCase();

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const looksLikeEmail = (v: string): boolean => EMAIL.test(normalizeEmail(v)) && normalizeEmail(v).length <= 254;

/** Live places an email is corrected. History tables are never listed here. */
export const EMAIL_AREAS = {
  login: "Sign-in email",
  profile: "Account profile",
  person: "Person record",
  client_contact: "Client contacts",
  client_invitation: "Open client invitations",
  fund_invitation: "Open fund invitations",
  fund_team_member: "Fund team entries",
  fund_team_grant: "Fund team access",
  fund_setup_party: "Fund setup people",
  onboarding_participant: "Investment helpers",
  crm_contact: "CRM contacts",
  cap_stakeholder: "Cap table holders",
  client_primary_contact: "Client main contact",
  client_billing_contact: "Client billing contact",
} as const;
export type EmailArea = keyof typeof EMAIL_AREAS;

export interface EmailFootprintRow {
  area: EmailArea;
  id: string;
  email: string | null;
  /** Fund, client or record name shown to staff. */
  where: string | null;
}

/** Every distinct address on file for this person, most-used first. */
export function emailsOnFile(rows: EmailFootprintRow[]): { email: string; count: number; areas: EmailArea[] }[] {
  const map = new Map<string, { count: number; areas: Set<EmailArea> }>();
  for (const r of rows) {
    const e = normalizeEmail(r.email);
    if (!e) continue;
    const m = map.get(e) ?? { count: 0, areas: new Set<EmailArea>() };
    m.count += 1;
    m.areas.add(r.area);
    map.set(e, m);
  }
  return [...map.entries()]
    .map(([email, m]) => ({ email, count: m.count, areas: [...m.areas] }))
    .sort((a, b) => b.count - a.count || a.email.localeCompare(b.email));
}

/** Rows that will change: every live row whose email differs from the new one. */
export function planEmailCorrection(rows: EmailFootprintRow[], newEmail: string): EmailFootprintRow[] {
  const target = normalizeEmail(newEmail);
  return rows.filter((r) => normalizeEmail(r.email) !== target);
}

export interface CorrectionConflicts {
  /** Another login account already signs in with the new email. */
  otherLogin: boolean;
  /** Another, unmerged person record already uses the new email. */
  otherPerson: boolean;
}

/** Null when allowed, else the plain reason the correction is refused. */
export function emailCorrectionProblem(input: { newEmail: string; rows: EmailFootprintRow[]; conflicts: CorrectionConflicts }): string | null {
  if (!looksLikeEmail(input.newEmail)) return "Enter a full email address, like name@company.com.";
  if (input.conflicts.otherLogin) return "Another login already uses that email. Open that account instead; separate accounts are never merged automatically.";
  if (input.conflicts.otherPerson) return "Another person record already uses that email. Check whether it is the same person before changing anything.";
  if (!planEmailCorrection(input.rows, input.newEmail).length) return "Everything already uses that email.";
  return null;
}

/** Plain summary of what changed, for the confirmation and the audit entry. */
export function summarizeCorrection(changed: EmailFootprintRow[]): { area: EmailArea; label: string; count: number }[] {
  const counts = new Map<EmailArea, number>();
  for (const r of changed) counts.set(r.area, (counts.get(r.area) ?? 0) + 1);
  return (Object.keys(EMAIL_AREAS) as EmailArea[])
    .filter((a) => counts.has(a))
    .map((a) => ({ area: a, label: EMAIL_AREAS[a], count: counts.get(a)! }));
}
