/**
 * Fund Drive intake - pure rules. Operations scan the fund's Drive "Investors" folder,
 * match each investor subfolder to a roster investor, and classify each file by its name.
 * Nothing is saved until Operations approve a row.
 */
import { nameTokens, namesMatch } from "@/lib/investor-document-save-model";

/**
 * Where an approved Drive file goes. "prior": kept on the investment as an earlier record
 * (signed copies and investment documents such as capital account statements; evidence only,
 * never marks anything signed, funded or verified). "upload": the investor's documents for review.
 * "fund": a new version on the fund's Documents awaiting approval; no investor is needed.
 */
export const INTAKE_GROUPS = [
  { key: "signed", label: "Investor's signed documents" },
  { key: "investment", label: "Investment documents" },
  { key: "investor", label: "Investor's ID and entity papers" },
  { key: "fund", label: "Fund documents" },
] as const;
export type IntakeGroup = (typeof INTAKE_GROUPS)[number]["key"];

export const INTAKE_TARGETS = [
  { key: "subscription_agreement", label: "Signed outside · Subscription Agreement", store: "prior", group: "signed" },
  { key: "operating_agreement", label: "Signed outside · Operating Agreement", store: "prior", group: "signed" },
  { key: "side_letter", label: "Signed outside · Side letter", store: "prior", group: "signed" },
  { key: "tax_form", label: "Signed outside · Tax form (W-9 / W-8)", store: "prior", group: "signed" },
  { key: "accreditation", label: "Signed outside · Accreditation evidence", store: "prior", group: "signed" },
  { key: "other", label: "Signed outside · Other document", store: "prior", group: "signed" },
  { key: "capital_account_statement", label: "Investment · Capital account statement", store: "prior", group: "investment" },
  { key: "schedule_k1", label: "Investment · Schedule K-1", store: "prior", group: "investment" },
  { key: "capital_call_notice", label: "Investment · Capital call notice", store: "prior", group: "investment" },
  { key: "distribution_notice", label: "Investment · Distribution notice", store: "prior", group: "investment" },
  { key: "funding_confirmation", label: "Investment · Wire or funding confirmation (record only)", store: "prior", group: "investment" },
  { key: "investment_other", label: "Investment · Other investment document", store: "prior", group: "investment" },
  { key: "doc_identification", label: "Documents · Government ID", store: "upload", group: "investor" },
  { key: "doc_proof_of_address", label: "Documents · Proof of address", store: "upload", group: "investor" },
  { key: "doc_entity_formation", label: "Documents · Entity formation", store: "upload", group: "investor" },
  { key: "doc_operating_agreement", label: "Documents · Entity operating or trust agreement", store: "upload", group: "investor" },
  { key: "doc_ownership_list", label: "Documents · Ownership list", store: "upload", group: "investor" },
  { key: "fund_operating_agreement", label: "Fund · Operating Agreement (fund's copy)", store: "fund", group: "fund", category: "operating_agreement" },
  { key: "fund_subscription_agreement", label: "Fund · Subscription Agreement (blank form)", store: "fund", group: "fund", category: "subscription_agreement" },
  { key: "fund_ppm", label: "Fund · Private placement memorandum", store: "fund", group: "fund", category: "ppm" },
  { key: "fund_wire_form", label: "Fund · Wire instructions", store: "fund", group: "fund", category: "wire_form" },
  { key: "fund_other", label: "Fund · Other fund document", store: "fund", group: "fund", category: "other" },
] as const;
export type IntakeTarget = (typeof INTAKE_TARGETS)[number]["key"];
export const intakeTarget = (k: string) => INTAKE_TARGETS.find((t) => t.key === k) ?? null;
/** Fund documents belong to the fund, not to one investor. */
export const targetNeedsInvestor = (k: string | null | undefined) => !k || intakeTarget(k)?.store !== "fund";

/** Best guess from the file name; null means Operations pick. */
export function classifyFileName(name: string): IntakeTarget | null {
  const n = name.toLowerCase().replace(/[_\-.]+/g, " ");
  if (/\bk ?1\b|schedule k/.test(n)) return "schedule_k1";
  if (/capital account|capital statement|partner (capital )?statement|investor statement/.test(n)) return "capital_account_statement";
  if (/capital call|drawdown notice/.test(n)) return "capital_call_notice";
  if (/distribution (notice|statement)/.test(n)) return "distribution_notice";
  if (/wire confirmation|funding confirmation|wire receipt/.test(n)) return "funding_confirmation";
  if (/\bppm\b|private placement|offering memorandum/.test(n) && !/acknowledg|signature|signed/.test(n)) return "fund_ppm";
  if (/subscription|\bsub (agreement|doc)/.test(n)) return "subscription_agreement";
  if (/side letter/.test(n)) return "side_letter";
  if (/\bw ?9\b|\bw ?8/.test(n)) return "tax_form";
  if (/accredit/.test(n)) return "accreditation";
  if (/operating agreement|llc agreement|limited partnership agreement|\blpa\b/.test(n)) {
    return "operating_agreement";
  }
  if (/passport|driver|license|\bid\b/.test(n)) return "doc_identification";
  if (/utility|proof of address|bank statement/.test(n)) return "doc_proof_of_address";
  if (/certificate of (formation|incorporation)|articles|formation/.test(n)) return "doc_entity_formation";
  if (/trust agreement|bylaws/.test(n)) return "doc_operating_agreement";
  if (/ownership|beneficial owner/.test(n)) return "doc_ownership_list";
  return null;
}

export type RosterEntry = { onboardingId: string; names: string[] };

/** Candidate names in a folder like "Benjamin Bassichis (Advanced Investment Corp)". */
export function folderNames(folder: string): string[] {
  const out = [folder.trim()];
  const m = folder.match(/^(.*?)\(([^)]+)\)\s*$/);
  if (m) out.push(m[1]!.trim(), m[2]!.trim());
  return out.filter((s) => s.length >= 2);
}

function closeWord(a: string, b: string) {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 5 || Math.abs(a.length - b.length) > 1) return false;
  // One letter added, dropped, changed or swapped (e.g. "Hennggeler", "Intrests", "P4L2"/"Pfl2").
  let i = 0; while (i < a.length && a[i] === b[i]) i++;
  const tail = (x: string, y: string) => x === y;
  return tail(a.slice(i + 1), b.slice(i + 1)) || tail(a.slice(i + 1), b.slice(i)) || tail(a.slice(i), b.slice(i + 1)) || (a[i] === b[i + 1] && a[i + 1] === b[i] && tail(a.slice(i + 2), b.slice(i + 2)));
}
/** Loose match for small spelling differences: every word of the shorter name is close to a word of the longer. */
export function namesClose(a: string, b: string): boolean {
  const x = nameTokens(a), y = nameTokens(b);
  if (x.length < 2 && y.length < 2) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length > 0 && short.every((w) => long.some((v) => closeWord(w, v)));
}

/** The single roster investor this folder belongs to; null when none or several match. Entity names win over person names. */
export function matchFolder(folder: string, roster: RosterEntry[]): string | null {
  const cands = folderNames(folder);
  const hits = new Set<string>();
  for (const c of cands.slice().reverse()) {
    for (const r of roster) if (r.names.some((n) => namesMatch(c, n))) hits.add(r.onboardingId);
    if (hits.size === 1) return [...hits][0]!;
    if (hits.size > 1) hits.clear();
  }
  for (const c of cands.slice().reverse()) {
    for (const r of roster) if (r.names.some((n) => namesClose(c, n))) hits.add(r.onboardingId);
    if (hits.size === 1) return [...hits][0]!;
    hits.clear();
  }
  return null;
}

export type IntakeDecision = "approved" | "later" | "rejected";
export type IntakeRow = {
  fileId: string; fileName: string; folderName: string; modifiedTime: string | null; size: number | null;
  onboardingId: string | null; target: IntakeTarget | null; decision: IntakeDecision | null; readable: boolean;
};

/** Ready when the type is known (and the investor, unless it's a fund document) and nothing has been decided. */
export function rowStatus(r: Pick<IntakeRow, "onboardingId" | "target" | "decision" | "readable">): "added" | "rejected" | "later" | "ready" | "review" | "unreadable" {
  if (r.decision === "approved") return "added";
  if (r.decision === "rejected") return "rejected";
  if (!r.readable) return "unreadable";
  if (r.decision === "later") return "later";
  if (!r.target) return "review";
  return r.onboardingId || !targetNeedsInvestor(r.target) ? "ready" : "review";
}

/** Signed date default: the file's last-modified day, never in the future. */
export function defaultSignedOn(modified: string | null, today = new Date()): string {
  const d = modified ? new Date(modified) : today;
  const use = isNaN(d.getTime()) || d > today ? today : d;
  return use.toISOString().slice(0, 10);
}

/** New-investor draft from a Drive folder name such as "Charles Steinmetz (Charles P Steinmetz Rev Trust)". Operations confirm before saving. */
export type FolderInvestorDraft = { type: "individual" | "entity" | "trust"; firstName: string; lastName: string; legalName: string; email: string };
const ENTITY_WORDS = /\b(llc|l\.l\.c|inc|corp|corporation|company|co|lp|llp|ltd|fund|partners|partnership|holdings|capital|ventures|group|foundation|family office|ira)\b/i;
const TRUST_WORDS = /\b(trust|rev(ocable)?|living trust|ttee|trustee)\b/i;
export function draftFromFolder(folder: string): FolderInvestorDraft {
  const clean = folder.replace(/\s+/g, " ").trim();
  const m = clean.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  let person = m ? m[1]!.trim() : clean, entity = m ? m[2]!.trim() : "";
  // "Acme LLC (Jane Doe)": the entity is outside the brackets.
  if (m && (ENTITY_WORDS.test(person) || TRUST_WORDS.test(person)) && !(ENTITY_WORDS.test(entity) || TRUST_WORDS.test(entity))) [person, entity] = [entity, person];
  if (!m && (ENTITY_WORDS.test(clean) || TRUST_WORDS.test(clean))) { entity = clean; person = ""; }
  const type = entity ? (TRUST_WORDS.test(entity) ? "trust" : "entity") : "individual";
  const parts = person.split(" ").filter(Boolean);
  return { type, firstName: parts[0] ?? "", lastName: parts.slice(1).join(" "), legalName: entity, email: "" };
}

/** Most files read with AI to fill one investor's profile in one go. */
export const PROFILE_FILL_MAX_FILES = 15;
export const PROFILE_FILL_MAX_BYTES = 10 * 1024 * 1024;

type Named = { firstName: string | null; lastName: string | null; entityName: string | null };
/**
 * Which investor read from the folder is this roster investor: the one whose entity or
 * person name matches theirs; the only one read when none match by name; otherwise none.
 */
export function pickInvestorFor<T extends Named>(names: readonly string[], list: readonly T[]): T | null {
  const hit = list.filter((i) => names.some((n) => (i.entityName && namesMatch(i.entityName, n)) || (i.firstName && i.lastName && namesMatch(`${i.firstName} ${i.lastName}`, n))));
  if (hit.length === 1) return hit[0]!;
  if (hit.length > 1) return hit.find((i) => i.entityName && names.some((n) => namesMatch(i.entityName!, n))) ?? hit[0]!;
  return list.length === 1 ? list[0]! : null;
}
