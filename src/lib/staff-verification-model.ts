// Pure: rules for KYC/AML details entered by Operations. No I/O.
// One person enters; a different authorized reviewer approves (Super Admin may approve their own with a reason).

export const ID_TYPES = [["drivers_license", "Driver's license"], ["passport", "Passport"], ["state_id", "State ID card"], ["other_government_id", "Other government ID"]] as const;
export const KYC_METHODS = [["other_provider", "Verified by another verification provider"], ["in_person", "ID reviewed in person"], ["video_call", "ID reviewed on a video call"], ["certified_copy", "Certified or notarized ID copy"]] as const;
export const SELFIE_RESULTS = [["passed", "Selfie / face match passed"], ["not_performed", "No selfie or face match"]] as const;
export const AML_RESULTS = [["no_matches", "No matches"], ["matches_ruled_out", "Possible matches, all ruled out"], ["confirmed_match", "Confirmed match"]] as const;

export type IdType = (typeof ID_TYPES)[number][0];
export type KycMethod = (typeof KYC_METHODS)[number][0];
export type AmlResult = (typeof AML_RESULTS)[number][0];

export type KycEntry = {
  legalName: string; dateOfBirth: string; idType: IdType; issuingCountry: string; issuingRegion?: string | null;
  idLast4: string; idExpires: string; method: KycMethod; verifiedOn: string; selfie: "passed" | "not_performed";
};
export type AmlEntry = { screenedOn: string; listsChecked: string; result: AmlResult; explanation?: string | null };
export type EntryInput = { kyc: KycEntry | null; aml: AmlEntry | null; sourceReference: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const day = (s: string) => new Date(`${s}T00:00:00Z`).getTime();
const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z]/g, "");

/** Problems that stop an entry from being saved. Empty list = valid. */
export function entryProblems(input: EntryInput, today: string): string[] {
  const p: string[] = [];
  if (!input.kyc && !input.aml) p.push("Enter identity details, screening details, or both.");
  if (input.sourceReference.trim().length < 3) p.push("Say where the original evidence is kept.");
  const k = input.kyc;
  if (k) {
    if (k.legalName.trim().length < 2) p.push("Enter the full legal name shown on the ID.");
    if (!DATE.test(k.dateOfBirth) || day(k.dateOfBirth) >= day(today)) p.push("Enter a valid date of birth.");
    if (!/^[A-Za-z0-9]{4}$/.test(k.idLast4)) p.push("Enter the last 4 characters of the ID number.");
    if (k.issuingCountry.trim().length < 2) p.push("Enter the country that issued the ID.");
    if (!DATE.test(k.verifiedOn) || day(k.verifiedOn) > day(today)) p.push("The verification date can't be in the future.");
    if (!DATE.test(k.idExpires)) p.push("Enter the ID expiration date.");
    else if (DATE.test(k.verifiedOn) && day(k.idExpires) <= day(k.verifiedOn)) p.push("The ID was expired when it was checked.");
  }
  const a = input.aml;
  if (a) {
    if (!DATE.test(a.screenedOn) || day(a.screenedOn) > day(today)) p.push("The screening date can't be in the future.");
    if (a.listsChecked.trim().length < 3) p.push("Say which watchlists were checked.");
    if (a.result === "matches_ruled_out" && (a.explanation ?? "").trim().length < 10) p.push("Explain why each possible match was ruled out.");
  }
  return p;
}

/** Why an approval is refused, or null when the reviewer may approve. */
export function approvalError(input: {
  entry: { entered_by: string; status: string; kyc: KycEntry | null; aml: AmlEntry | null };
  deciderId: string; deciderIsSuperAdmin: boolean; subjectUserId: string | null; note: string | null | undefined;
  personDateOfBirth: string | null; personLegalName: string | null; today: string;
}): string | null {
  const note = input.note?.trim() ?? "";
  const { entry } = input;
  if (entry.status !== "review") return "Only entries waiting for review can be approved.";
  if (input.subjectUserId && input.subjectUserId === input.deciderId) return "You can't approve your own verification.";
  if (entry.entered_by === input.deciderId && !(input.deciderIsSuperAdmin && note)) {
    return input.deciderIsSuperAdmin ? "Add a reason to approve details you entered yourself." : "Someone other than the person who entered these details must approve them.";
  }
  if (entry.aml?.result === "confirmed_match") return "A confirmed watchlist match can't be cleared here. Decline it and escalate to compliance.";
  const k = entry.kyc;
  if (k) {
    if (day(k.idExpires) <= day(input.today)) return "The ID has expired since it was checked. Ask for a current ID.";
    if (input.personDateOfBirth && input.personDateOfBirth !== k.dateOfBirth) return "The date of birth doesn't match the person's record. Check which is right before approving.";
    if (k.selfie === "not_performed" && !note) return "No selfie or face match was done. Add a note explaining why the ID review is enough.";
    if (input.personLegalName && norm(input.personLegalName) !== norm(k.legalName) && !note) return "The name on the ID differs from the person's record. Add a note confirming it's the same person.";
  }
  return null;
}

/** What approval changes on the person record. Only moves statuses forward to approved. */
export function approvalEffects(entry: { kyc: KycEntry | null; aml: AmlEntry | null }, person: { kyc_status: string | null; aml_status: string | null; date_of_birth: string | null }) {
  return {
    kyc: !!entry.kyc && person.kyc_status !== "approved",
    aml: !!entry.aml && entry.aml.result !== "confirmed_match" && person.aml_status !== "approved",
    fillDateOfBirth: !!entry.kyc && !person.date_of_birth ? entry.kyc.dateOfBirth : null,
  };
}
