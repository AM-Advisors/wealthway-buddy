// Pure: rules for KYC/KYB/AML details entered by Operations. No I/O.
// One person enters; a different authorized reviewer approves (Super Admin may approve their own with a reason).

export const ID_TYPES = [["drivers_license", "Driver's license"], ["passport", "Passport"], ["state_id", "State ID card"], ["other_government_id", "Other government ID"]] as const;
export const KYC_METHODS = [["other_provider", "Verified by another verification provider"], ["in_person", "ID reviewed in person"], ["video_call", "ID reviewed on a video call"], ["certified_copy", "Certified or notarized ID copy"]] as const;
export const SELFIE_RESULTS = [["passed", "Selfie / face match passed"], ["not_performed", "No selfie or face match"]] as const;
export const AML_RESULTS = [["no_matches", "No matches"], ["matches_ruled_out", "Possible matches, all ruled out"], ["confirmed_match", "Confirmed match"]] as const;
export const KYB_METHODS = [["other_provider", "Verified by another verification provider"], ["state_registry", "Checked with the state business registry"], ["formation_documents", "Formation documents reviewed"], ["certified_copy", "Certified copies reviewed"]] as const;
export const SCREENING_STATUS = { approved: "No matches that need review", review: "Possible matches found", declined: "High-risk match found" } as const;
/** Wording for the lists a fresh platform screening covers. Never names the provider. */
export const FRESH_SCREENING_LISTS = "Sanctions, politically exposed persons, watchlists and adverse media (1,300+ lists)";

export type IdType = (typeof ID_TYPES)[number][0];
export type KycMethod = (typeof KYC_METHODS)[number][0];
export type KybMethod = (typeof KYB_METHODS)[number][0];
export type AmlResult = (typeof AML_RESULTS)[number][0];
export type SubjectKind = "person" | "company";

export type KycEntry = {
  legalName: string; dateOfBirth: string; idType: IdType; issuingCountry: string; issuingRegion?: string | null;
  idLast4: string; idExpires: string; method: KycMethod; verifiedOn: string; selfie: "passed" | "not_performed";
};
export type AmlEntry = { screenedOn: string; listsChecked: string; result: AmlResult; explanation?: string | null };
export type KybEntry = {
  legalName: string; entityType?: string | null; formationJurisdiction?: string | null; formationDate?: string | null;
  method: KybMethod; verifiedOn: string; ownersChecked: string;
};
/** Extra facts kept with the entry; on approval they only fill blanks on the record. */
export type PersonDetails = {
  addressLine1?: string | null; addressLine2?: string | null; city?: string | null; region?: string | null;
  postalCode?: string | null; country?: string | null; citizenship?: string | null; phone?: string | null; occupation?: string | null;
};
export type ScreeningHit = { caption: string; datasets: string[]; matchScore: number | null; riskScore: number | null; reviewStatus: string | null };
export type ScreeningResult = {
  requestId: string | null; status: "approved" | "review" | "declined"; totalHits: number; score: number | null;
  hits: ScreeningHit[]; screenedOn: string; screenedName: string; entityType: SubjectKind;
};
export type Sensitive = { idNumberLast4?: string; ssnLast4?: string; einLast4?: string };

export type EntryInput = {
  subject?: SubjectKind; kyc: KycEntry | null; aml: AmlEntry | null; kyb?: KybEntry | null; details?: PersonDetails | null;
  runScreening?: boolean; sourceReference: string; idNumber?: string | null; ssn?: string | null; ein?: string | null;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const day = (s: string) => new Date(`${s}T00:00:00Z`).getTime();
const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z]/g, "");
const digits = (s: unknown) => String(s ?? "").replace(/\D/g, "");
export const cleanIdNumber = (s: unknown) => String(s ?? "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
const has = (s: unknown) => String(s ?? "").trim().length > 0;

/** Problems that stop an entry from being saved. Empty list = valid. */
export function entryProblems(input: EntryInput, today: string): string[] {
  const p: string[] = [];
  const subject = input.subject ?? "person";
  if (subject === "person" && input.kyb) p.push("Business verification only applies to companies.");
  if (subject === "company" && input.kyc) p.push("Choose the company's owners as people to record their ID checks.");
  if (input.aml && input.runScreening) p.push("Choose either a past screening or a fresh one, not both.");
  const hasCheck = subject === "person" ? !!input.kyc || !!input.aml || !!input.runScreening : !!input.kyb || !!input.aml || !!input.runScreening;
  if (!hasCheck) p.push(subject === "person" ? "Enter identity details, screening details, or both." : "Enter business verification details, screening details, or both.");
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
  if (has(input.idNumber)) {
    const id = cleanIdNumber(input.idNumber);
    if (!k) p.push("Add the identity details to go with the full ID number.");
    if (id.length < 4 || id.length > 30) p.push("The full ID number should be 4 to 30 letters or numbers.");
    else if (k && k.idLast4 && id.slice(-4) !== k.idLast4.toUpperCase()) p.push("The last 4 of the ID number don't match the full ID number.");
  }
  if (has(input.ssn)) {
    if (subject !== "person") p.push("Social Security numbers belong to people, not companies.");
    if (digits(input.ssn).length !== 9) p.push("The Social Security number must be 9 digits.");
  }
  if (has(input.ein)) {
    if (subject !== "company") p.push("EINs belong to companies.");
    if (digits(input.ein).length !== 9) p.push("The EIN must be 9 digits.");
  }
  const b = input.kyb;
  if (b) {
    if (b.legalName.trim().length < 2) p.push("Enter the company's full legal name.");
    if (!DATE.test(b.verifiedOn) || day(b.verifiedOn) > day(today)) p.push("The business verification date can't be in the future.");
    if (b.formationDate && (!DATE.test(b.formationDate) || day(b.formationDate) > day(today))) p.push("Enter a valid formation date.");
    if (b.ownersChecked.trim().length < 3) p.push("Say which owners and controllers were checked.");
  }
  const a = input.aml;
  if (a) {
    if (!DATE.test(a.screenedOn) || day(a.screenedOn) > day(today)) p.push("The screening date can't be in the future.");
    if (a.listsChecked.trim().length < 3) p.push("Say which watchlists were checked.");
    if (a.result === "matches_ruled_out" && (a.explanation ?? "").trim().length < 10) p.push("Explain why each possible match was ruled out.");
  }
  const d = input.details;
  if (d?.phone && digits(d.phone).length < 7) p.push("Enter a full phone number.");
  if (d && has(d.addressLine1) && !has(d.city)) p.push("Enter the city with the street address.");
  return p;
}

/** Display-safe last-four values for the entry; full numbers go only to the encrypted store. */
export function sensitiveSummary(input: Pick<EntryInput, "idNumber" | "ssn" | "ein">): Sensitive {
  const out: Sensitive = {};
  if (has(input.idNumber)) out.idNumberLast4 = cleanIdNumber(input.idNumber).slice(-4);
  if (has(input.ssn)) out.ssnLast4 = digits(input.ssn).slice(-4);
  if (has(input.ein)) out.einLast4 = digits(input.ein).slice(-4);
  return out;
}

/** Map a provider screening response to the stored, display-safe result. */
export function screeningFromResponse(json: any, ctx: { today: string; name: string; entityType: SubjectKind }): ScreeningResult {
  const aml = json?.aml ?? json ?? {};
  const raw = String(aml.status ?? "").toLowerCase();
  const status: ScreeningResult["status"] = raw === "approved" ? "approved" : raw === "declined" ? "declined" : "review";
  const hits = (Array.isArray(aml.hits) ? aml.hits : []).slice(0, 15).map((h: any): ScreeningHit => ({
    caption: String(h?.caption ?? h?.properties?.name?.[0] ?? "Unnamed match").slice(0, 200),
    datasets: (Array.isArray(h?.datasets) ? h.datasets : []).map((x: unknown) => String(x)).slice(0, 8),
    matchScore: typeof h?.match_score === "number" ? h.match_score : null,
    riskScore: typeof h?.risk_score === "number" ? h.risk_score : null,
    reviewStatus: h?.review_status ? String(h.review_status) : null,
  }));
  return {
    requestId: json?.request_id ? String(json.request_id) : null, status,
    totalHits: typeof aml.total_hits === "number" ? aml.total_hits : hits.length,
    score: typeof aml.score === "number" ? aml.score : null, hits, screenedOn: ctx.today, screenedName: ctx.name, entityType: ctx.entityType,
  };
}

/** ISO alpha-2 code for a country name or code, or null when unknown. */
export function countryCode(value: string | null | undefined): string | null {
  const v = String(value ?? "").trim();
  if (!v) return null;
  if (/^[A-Za-z]{2}$/.test(v)) return v.toUpperCase();
  const n = norm(v);
  if (["usa", "us", "unitedstatesofamerica", "america"].includes(n)) return "US";
  if (["uk", "greatbritain", "england"].includes(n)) return "GB";
  try {
    const names = new Intl.DisplayNames(["en"], { type: "region" });
    for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      const name = names.of(code);
      if (name && name !== code && norm(name) === n) return code;
    }
  } catch { /* no region names available */ }
  return null;
}

/** Why an approval is refused, or null when the reviewer may approve. */
export function approvalError(input: {
  entry: { entered_by: string; status: string; kyc: KycEntry | null; aml: AmlEntry | null; kyb?: KybEntry | null; screening?: ScreeningResult | null };
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
  if (entry.screening?.status === "declined") return "The fresh screening found a high-risk match. Decline it and escalate to compliance.";
  if (entry.screening?.status === "review" && !note) return "The fresh screening found possible matches. Add a note explaining why each one was ruled out.";
  const k = entry.kyc;
  if (k) {
    if (day(k.idExpires) <= day(input.today)) return "The ID has expired since it was checked. Ask for a current ID.";
    if (input.personDateOfBirth && input.personDateOfBirth !== k.dateOfBirth) return "The date of birth doesn't match the person's record. Check which is right before approving.";
    if (k.selfie === "not_performed" && !note) return "No selfie or face match was done. Add a note explaining why the ID review is enough.";
    if (input.personLegalName && norm(input.personLegalName) !== norm(k.legalName) && !note) return "The name on the ID differs from the person's record. Add a note confirming it's the same person.";
  }
  const b = entry.kyb;
  if (b && input.personLegalName && norm(input.personLegalName) !== norm(b.legalName) && !note) return "The company name differs from the record. Add a note confirming it's the same company.";
  return null;
}

const amlCounts = (entry: { aml: AmlEntry | null; screening?: ScreeningResult | null }) =>
  (!!entry.aml && entry.aml.result !== "confirmed_match") || (!!entry.screening && entry.screening.status !== "declined");

/** Blank-only fills: a value on the record is never overwritten. Address fills as one unit. */
function fillBlanks(record: Record<string, unknown>, incoming: Record<string, unknown>, addressKeys: string[]) {
  const out: Record<string, string> = {};
  const blank = (v: unknown) => v == null || String(v).trim() === "";
  const addressBlank = addressKeys.every((k) => blank(record[k]));
  for (const [k, v] of Object.entries(incoming)) {
    if (blank(v)) continue;
    if (addressKeys.includes(k)) { if (addressBlank) out[k] = String(v).trim(); }
    else if (blank(record[k])) out[k] = String(v).trim();
  }
  return out;
}

/** What approval changes on the person record. Only moves statuses forward to approved and fills blanks. */
export function approvalEffects(
  entry: { kyc: KycEntry | null; aml: AmlEntry | null; screening?: ScreeningResult | null; details?: PersonDetails | null },
  person: Record<string, unknown> & { kyc_status: string | null; aml_status: string | null; date_of_birth: string | null },
) {
  const d = entry.details ?? {};
  return {
    kyc: !!entry.kyc && person.kyc_status !== "approved",
    aml: amlCounts(entry) && person.aml_status !== "approved",
    fillDateOfBirth: !!entry.kyc && !person.date_of_birth ? entry.kyc.dateOfBirth : null,
    fillPerson: fillBlanks(person, {
      address_line1: d.addressLine1, address_line2: d.addressLine2, city: d.city, region: d.region, postal_code: d.postalCode, country: d.country,
      citizenship_country: d.citizenship, phone: d.phone,
    }, ["address_line1", "address_line2", "city", "region", "postal_code", "country"]),
  };
}

/** What approval changes on a company's business verification record. */
export function companyApprovalEffects(
  entry: { kyb?: KybEntry | null; aml: AmlEntry | null; screening?: ScreeningResult | null; details?: PersonDetails | null },
  ev: Record<string, unknown> | null,
) {
  const b = entry.kyb, d = entry.details ?? {}, cur = ev ?? {};
  return {
    kyb: !!b && cur["kyb_status"] !== "approved",
    aml: amlCounts(entry) && cur["entity_aml_status"] !== "approved",
    fillEntity: fillBlanks(cur, {
      legal_name: b?.legalName, entity_type: b?.entityType, formation_jurisdiction: b?.formationJurisdiction, formation_date: b?.formationDate,
      address_line1: d.addressLine1, address_line2: d.addressLine2, city: d.city, region: d.region, postal_code: d.postalCode, country: d.country,
    }, ["address_line1", "address_line2", "city", "region", "postal_code", "country"]),
  };
}

/* ---------------- spreadsheet entry ---------------- */

export const BULK_VERIFICATION_COLUMNS = [
  "type", "email", "company_name", "legal_name", "date_of_birth", "id_type", "id_number", "id_last4", "id_country", "id_state", "id_expires",
  "id_verified_on", "id_method", "selfie", "ssn", "address_line1", "address_line2", "city", "state", "postal_code", "country", "citizenship",
  "phone", "occupation", "entity_type", "ein", "formation_state", "formation_date", "kyb_method", "kyb_verified_on", "owners_checked",
  "screening", "aml_screened_on", "aml_lists", "aml_result", "aml_explanation", "source_reference", "note",
] as const;
export type BulkVerificationRow = Partial<Record<(typeof BULK_VERIFICATION_COLUMNS)[number], string>>;
export type BulkMatch = { kind: "person"; email: string } | { kind: "company"; companyName: string };
export type BulkPlan = { row: number; label: string; match: BulkMatch | null; input: EntryInput & { note: string | null }; problems: string[] };

/** Normalize a header cell to a column key ("Date of birth" → date_of_birth). */
export const columnKey = (h: string) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

/** Accepts YYYY-MM-DD or M/D/YYYY; returns YYYY-MM-DD or the original text (so validation reports it). */
export function normalizeDate(v: string | undefined): string {
  const s = String(v ?? "").trim();
  if (!s || DATE.test(s)) return s;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s);
  if (!m) return s;
  const y = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
  return `${y}-${m[1]!.padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
}

function pick<T extends readonly (readonly [string, string])[]>(list: T, v: string | undefined, fallback: T[number][0]): T[number][0] | null {
  const s = norm(v);
  if (!s) return fallback;
  const hit = list.find(([k, l]) => norm(k) === s || norm(l) === s || norm(l).startsWith(s));
  return hit ? hit[0] : null;
}

/** Turn one spreadsheet row into a validated entry plan. Nothing is saved here. */
export function planBulkRow(raw: BulkVerificationRow, rowNumber: number, today: string): BulkPlan {
  const r = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, String(v ?? "").trim()])) as BulkVerificationRow;
  const problems: string[] = [];
  const subject: SubjectKind = norm(r.type).startsWith("comp") || norm(r.type) === "entity" || (!r.email && !!r.company_name) ? "company" : "person";
  const match: BulkMatch | null = subject === "person" ? (r.email ? { kind: "person", email: r.email.toLowerCase() } : null) : (r.company_name ? { kind: "company", companyName: r.company_name } : null);
  if (!match) problems.push(subject === "person" ? "Add the person's email so we can find their record." : "Add the company's legal name so we can find its record.");

  let kyc: KycEntry | null = null;
  if (subject === "person" && (r.id_last4 || r.id_number || r.id_expires || r.id_verified_on)) {
    const idType = pick(ID_TYPES, r.id_type, "drivers_license");
    const method = pick(KYC_METHODS, r.id_method, "other_provider");
    const selfie = norm(r.selfie) ? (["yes", "y", "passed", "true"].includes(norm(r.selfie)) ? "passed" : "not_performed") : "passed";
    if (!idType) problems.push(`ID type "${r.id_type}" isn't recognized.`);
    if (!method) problems.push(`Verification method "${r.id_method}" isn't recognized.`);
    kyc = {
      legalName: r.legal_name ?? "", dateOfBirth: normalizeDate(r.date_of_birth), idType: idType ?? "drivers_license",
      issuingCountry: r.id_country || "United States", issuingRegion: r.id_state || null,
      idLast4: (r.id_last4 || cleanIdNumber(r.id_number).slice(-4)).toUpperCase(), idExpires: normalizeDate(r.id_expires),
      method: method ?? "other_provider", verifiedOn: normalizeDate(r.id_verified_on) || today, selfie,
    };
  }
  let kyb: KybEntry | null = null;
  if (subject === "company" && (r.kyb_verified_on || r.kyb_method || r.owners_checked)) {
    const method = pick(KYB_METHODS, r.kyb_method, "other_provider");
    if (!method) problems.push(`Business verification method "${r.kyb_method}" isn't recognized.`);
    kyb = {
      legalName: r.legal_name || r.company_name || "", entityType: r.entity_type || null, formationJurisdiction: r.formation_state || null,
      formationDate: normalizeDate(r.formation_date) || null, method: method ?? "other_provider",
      verifiedOn: normalizeDate(r.kyb_verified_on) || today, ownersChecked: r.owners_checked ?? "",
    };
  }
  const mode = norm(r.screening);
  const runScreening = ["run", "fresh", "new", "runnow", "yes"].includes(mode);
  let aml: AmlEntry | null = null;
  if (!runScreening && (["past", "record", "recorded"].includes(mode) || r.aml_result || r.aml_screened_on)) {
    const result = pick(AML_RESULTS, r.aml_result, "no_matches");
    if (!result) problems.push(`Screening result "${r.aml_result}" isn't recognized.`);
    aml = { screenedOn: normalizeDate(r.aml_screened_on), listsChecked: r.aml_lists || "OFAC SDN and consolidated sanctions lists, PEP and adverse media", result: result ?? "no_matches", explanation: r.aml_explanation || null };
  }
  const details: PersonDetails = {
    addressLine1: r.address_line1 || null, addressLine2: r.address_line2 || null, city: r.city || null, region: r.state || null,
    postalCode: r.postal_code || null, country: r.country || null, citizenship: subject === "person" ? r.citizenship || null : null,
    phone: r.phone || null, occupation: subject === "person" ? r.occupation || null : null,
  };
  const input: BulkPlan["input"] = {
    subject, kyc, kyb, aml, details: Object.values(details).some(Boolean) ? details : null, runScreening,
    sourceReference: r.source_reference ?? "", idNumber: subject === "person" ? r.id_number || null : null,
    ssn: subject === "person" ? r.ssn || null : null, ein: subject === "company" ? r.ein || null : null, note: r.note || null,
  };
  problems.push(...entryProblems(input, today));
  const label = subject === "person" ? (r.legal_name || r.email || `Row ${rowNumber}`) : (r.company_name || `Row ${rowNumber}`);
  return { row: rowNumber, label, match, input, problems: [...new Set(problems)] };
}

/** Blank template with one example person and one example company (fictional). */
export function bulkTemplateCsv(): string {
  const cols = BULK_VERIFICATION_COLUMNS as readonly string[];
  const person: BulkVerificationRow = {
    type: "person", email: "avery.example@example.com", legal_name: "Avery Example", date_of_birth: "1980-02-03", id_type: "drivers_license",
    id_number: "D1234567", id_country: "United States", id_state: "TX", id_expires: "2031-06-30", id_verified_on: "2025-03-01",
    id_method: "other_provider", selfie: "yes", address_line1: "100 Main St", city: "Dallas", state: "TX", postal_code: "75201", country: "United States",
    citizenship: "United States", phone: "214-555-0100", occupation: "Engineer", screening: "run", source_reference: "Prior provider case 12345",
  };
  const company: BulkVerificationRow = {
    type: "company", company_name: "Example Holdings LLC", entity_type: "LLC", ein: "12-3456789", formation_state: "Texas",
    formation_date: "2019-05-01", kyb_method: "state_registry", kyb_verified_on: "2025-03-01", owners_checked: "Avery Example (100% owner, manager)",
    screening: "past", aml_screened_on: "2025-03-01", aml_result: "no_matches", source_reference: "Formation folder, prior administrator",
  };
  const esc = (v: string | undefined) => { const s = v ?? ""; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(","), cols.map((c) => esc((person as any)[c])).join(","), cols.map((c) => esc((company as any)[c])).join(",")].join("\n") + "\n";
}
