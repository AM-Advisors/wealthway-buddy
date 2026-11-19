/**
 * Where a document read with AI is saved on the investor's record, and the existing step
 * that can then put it to use. Saving never decides anything; each use is a separate,
 * explicit action through the existing review engines.
 */
export const SAVE_TARGETS = [
  { key: "tax_form", label: "Signed W-9 or W-8", store: "upload", use: "tax_outside" },
  { key: "accreditation_proof", label: "Accreditation proof", store: "upload", use: "accept_accreditation" },
  { key: "identification", label: "Government ID", store: "upload", use: null },
  { key: "proof_of_address", label: "Proof of address", store: "upload", use: "accept_copy" },
  { key: "entity_formation", label: "Entity formation document", store: "upload", use: "accept_copy" },
  { key: "operating_agreement", label: "Entity operating or trust agreement", store: "upload", use: "accept_copy" },
  { key: "fund_operating_agreement", label: "Signed fund operating agreement", store: "prior", use: null },
  { key: "schedule_k1", label: "Schedule K-1", store: "prior", use: null },
  { key: "capital_account_statement", label: "Capital account statement", store: "prior", use: null },
  { key: "ownership_list", label: "Ownership list", store: "upload", use: "accept_copy" },
  { key: "subscription_agreement", label: "Signed subscription agreement", store: "prior", use: "subscription_outside" },
  { key: "side_letter", label: "Signed side letter", store: "prior", use: null },
  { key: "other", label: "Other signed document", store: "prior", use: null },
] as const;
export type SaveTargetKey = (typeof SAVE_TARGETS)[number]["key"];
export type SaveUse = (typeof SAVE_TARGETS)[number]["use"];
export const saveTarget = (k: string) => SAVE_TARGETS.find((t) => t.key === k) ?? null;

export const USE_LABEL: Record<NonNullable<SaveUse>, string> = {
  tax_outside: "Use as the investor's tax form",
  accept_accreditation: "Approve as accreditation proof",
  accept_copy: "Accept this copy",
  subscription_outside: "Mark subscription signed outside the platform",
};

/** Best guess from the AI's document label; null means a person picks. */
export function guessSaveTarget(documentKind: string): SaveTargetKey | null {
  const k = documentKind.toLowerCase();
  if (/\bk-?1\b|schedule k/.test(k)) return "schedule_k1";
  if (/capital account|capital statement|partner (capital )?statement|investor statement/.test(k)) return "capital_account_statement";
  if (/\bw-?9\b|\bw-?8|tax form/.test(k)) return "tax_form";
  if (/accredit|cpa letter|attorney letter|verification letter/.test(k)) return "accreditation_proof";
  if (/subscription/.test(k)) return "subscription_agreement";
  if (/side letter/.test(k)) return "side_letter";
  if (/passport|driver|license|government id|\bid card\b|identification/.test(k)) return "identification";
  if (/utility|proof of address|address/.test(k)) return "proof_of_address";
  if (/certificate of (formation|incorporation)|articles|formation|trust certificate/.test(k)) return "entity_formation";
  if (/fund operating agreement|spv operating agreement|^operating agreement$/.test(k)) return "fund_operating_agreement";
  if (/operating agreement|trust agreement|partnership agreement|bylaws/.test(k)) return "operating_agreement";
  if (/ownership|beneficial owner|cap table/.test(k)) return "ownership_list";
  return null;
}

/** What each type usually contains, given to the AI when a person picks the type first. */
export const TARGET_HINT: Record<SaveTargetKey, string> = {
  tax_form: "IRS Form W-9 or W-8 (BEN, BEN-E, IMY, ECI). Report which form in tax_form.",
  accreditation_proof: "Accredited investor verification letter or supporting statement; report the letter date.",
  identification: "Government ID (passport, driver license, national ID); report the expiry date. Never return the ID number.",
  proof_of_address: "Utility bill, bank or brokerage statement used as proof of address; report the statement date.",
  entity_formation: "Certificate of formation, incorporation, articles or trust certificate.",
  operating_agreement: "The investor's own entity operating, partnership or trust agreement (KYC proof of the investing entity).",
  fund_operating_agreement: "The fund's or SPV's operating or LP agreement signed by the investor as a member; report whether it is signed and the signature date.",
  schedule_k1: "IRS Schedule K-1 issued by the fund to this investor; report the tax year end as document_date (YYYY-12-31).",
  capital_account_statement: "Capital account statement issued to this investor by the fund or an earlier administrator; report the statement period end as document_date.",
  ownership_list: "List of owners or beneficial owners with percentages.",
  subscription_agreement: "Fund subscription agreement; report whether it is signed and the signature date.",
  side_letter: "Side letter between the fund and the investor; report whether it is signed and the date.",
  other: "Other signed investor document.",
};

export type FoundName = { name: string; role: "person" | "entity" | "signer" };
export type Party = { name: string; role: "investing_party" | "person" | "joint" | "signer" | "owner" };
export type OwnerCheck = { status: "match" | "different" | "unknown"; matched: Party | null; found: FoundName[] };

const STOP = new Set(["the", "llc", "lp", "llp", "inc", "corp", "co", "ltd", "trust", "rev", "revocable", "living", "of", "and", "family", "dated", "jr", "sr", "ii", "iii", "mr", "mrs", "ms", "dr", "ttee", "trustee", "trustees"]);
/** Lowercase name words without punctuation or legal suffixes. */
export function nameTokens(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w));
}
/** Two names match when every word of the shorter name is in the longer one (initials allowed). */
export function namesMatch(a: string, b: string): boolean {
  const x = nameTokens(a), y = nameTokens(b);
  if (!x.length || !y.length) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.every((w) => long.some((v) => v === w || (w.length === 1 && v.startsWith(w)) || (v.length === 1 && w.startsWith(v))));
}
/** Compares names found in a document with this investment's investing party, person, joint investor and signers. */
export function ownerMatch(found: FoundName[], parties: Party[]): OwnerCheck {
  const names = found.filter((f) => f.name.trim());
  if (!names.length) return { status: "unknown", matched: null, found: [] };
  for (const f of names) for (const p of parties) if (namesMatch(f.name, p.name)) return { status: "match", matched: p, found: names };
  return { status: "different", matched: null, found: names };
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
/** Warnings only: expired IDs, stale address proof and accreditation letters older than 90 days. */
export function expiryWarnings(input: { target: SaveTargetKey | null; documentDate: string | null; expiresOn: string | null; today: string }): string[] {
  const out: string[] = [];
  const valid = (d: string | null) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);
  if (input.target === "identification" && valid(input.expiresOn) && input.expiresOn! < input.today) out.push(`Expired ${input.expiresOn}`);
  if ((input.target === "proof_of_address" || input.target === "accreditation_proof") && valid(input.documentDate) && daysBetween(input.documentDate!, input.today) > 90) out.push(`Older than 90 days (dated ${input.documentDate})`);
  return out;
}

/** Whether the tax form fits the investing party. US persons use W-9; others a W-8. */
export function taxFormFit(input: { form: string | null; profileType: string | null; country: string | null }): string | null {
  const form = (input.form ?? "").toUpperCase().replace(/\s/g, "");
  if (!form) return null;
  const c = (input.country ?? "").trim().toUpperCase();
  const us = !c || ["US", "USA", "UNITED STATES", "UNITED STATES OF AMERICA"].includes(c);
  const entity = !!input.profileType && !["individual", "joint", "ira"].includes(input.profileType);
  if (form.startsWith("W-9") || form === "W9") return us ? null : `${entity ? "W-8BEN-E" : "W-8BEN"} expected for a non-US investor`;
  if (form.startsWith("W-8") || form.startsWith("W8")) {
    if (us) return "W-9 expected for a US investor";
    if (entity && /W-?8BEN$/.test(form)) return "W-8BEN-E expected for an entity";
    if (!entity && /BEN-?E$/.test(form)) return "W-8BEN expected for an individual";
  }
  return null;
}

/** A file is a duplicate when the same file name of the same type is already on the investment. */
export function duplicateOf(existing: Array<{ fileName: string; kind: string; savedAt: string }>, fileName: string, kind: SaveTargetKey | null) {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9.]+/g, "_");
  return existing.find((e) => norm(e.fileName) === norm(fileName) && (!kind || e.kind === kind || (kind === "other" && e.kind === "other"))) ?? null;
}

export type FoundRow = { label: string; value: string; suggested: boolean; suggestionId: string | null; editValue: string };
export type DocumentReadResult = {
  documentKind: string; summary: string; found: FoundRow[]; values: Record<string, string>;
  detectedType: SaveTargetKey | null; typeMismatch: boolean; suggestedType: SaveTargetKey | null; names: FoundName[];
  owner: { status: "match" | "different" | "unknown"; matchedName: string | null; matchedRole: string | null };
  signed: boolean | null; documentDate: string | null; expiresOn: string | null; taxForm: string | null; warnings: string[];
  duplicate: { savedAt: string; kind: string } | null;
};
export type RecentRead = { event: string; at: string; fileName: string; type: string | null; owner: string | null };
