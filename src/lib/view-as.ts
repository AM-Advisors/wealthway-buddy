/**
 * View As — pure rules shared by server and tests.
 * View As is an authorization perspective, never an authentication: the staff
 * member stays signed in as themselves and every write is attributed to them.
 */
export type Perspective = "investor" | "fund_manager";

export const VIEW_AS_MINUTES = 60;

export const VIEW_AS_COPY = {
  signedInAs: "You are signed in as Harmonious staff.",
  readOnly: "Read-only. This shows exactly what they see; nothing can be changed from this view.",
  editNotice:
    "You are editing this record as Harmonious. Changes will be recorded as Harmonious-administered changes and will not be attributed to the client.",
  notConverted: "Not yet available in client view.",
} as const;

export const PERSPECTIVE_LABEL: Record<Perspective, string> = { investor: "Investor", fund_manager: "Fund Manager" };

/** Reasons offered for material Harmonious-administered corrections. */
export const CORRECTION_REASONS = [
  "Client requested correction",
  "Supporting document received",
  "Data migration correction",
  "Harmonious administrative correction",
  "Fund Manager instruction",
  "Other",
] as const;

export const MATERIAL_FIELDS = new Set([
  "legal_name", "entity_name", "amount", "accepted_amount", "legal_address",
  "ownership", "control", "offering_terms", "close_economics",
]);

export function reasonRequired(field: string) {
  return MATERIAL_FIELDS.has(field);
}

export type ViewAsSessionRow = {
  staff_user_id: string;
  auth_session_id: string | null;
  ended_at: string | null;
  expires_at: string;
};

/** A session is live only for the same staff member, same sign-in, not ended, not expired. */
export function sessionIsLive(row: ViewAsSessionRow | null, staffUserId: string, authSessionId: string | null, now = Date.now()) {
  if (!row) return false;
  if (row.staff_user_id !== staffUserId) return false;
  if (row.ended_at) return false;
  if (new Date(row.expires_at).getTime() <= now) return false;
  if ((row.auth_session_id ?? null) !== (authSessionId ?? null)) return false;
  return true;
}

/** Staff can never view as another Harmonious staff account (would expose staff powers). */
export function subjectAllowed(subject: { isStaff: boolean }) {
  return !subject.isStaff;
}
