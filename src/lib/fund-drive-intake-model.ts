/**
 * Fund Drive intake - pure rules. Operations scan the fund's Drive "Investors" folder,
 * match each investor subfolder to a roster investor, and classify each file by its name.
 * Nothing is saved until Operations approve a row.
 */
import { nameTokens, namesMatch } from "@/lib/investor-document-save-model";

export const INTAKE_TARGETS = [
  { key: "subscription_agreement", label: "Signed outside · Subscription Agreement", store: "prior" },
  { key: "operating_agreement", label: "Signed outside · Operating Agreement", store: "prior" },
  { key: "side_letter", label: "Signed outside · Side letter", store: "prior" },
  { key: "schedule_k1", label: "Signed outside · Schedule K-1", store: "prior" },
  { key: "tax_form", label: "Signed outside · Tax form (W-9 / W-8)", store: "prior" },
  { key: "accreditation", label: "Signed outside · Accreditation evidence", store: "prior" },
  { key: "doc_identification", label: "Documents · Government ID", store: "upload" },
  { key: "doc_proof_of_address", label: "Documents · Proof of address", store: "upload" },
  { key: "doc_entity_formation", label: "Documents · Entity formation", store: "upload" },
  { key: "doc_operating_agreement", label: "Documents · Entity operating or trust agreement", store: "upload" },
  { key: "doc_ownership_list", label: "Documents · Ownership list", store: "upload" },
  { key: "other", label: "Signed outside · Other document", store: "prior" },
] as const;
export type IntakeTarget = (typeof INTAKE_TARGETS)[number]["key"];
export const intakeTarget = (k: string) => INTAKE_TARGETS.find((t) => t.key === k) ?? null;

/** Best guess from the file name; null means Operations pick. */
export function classifyFileName(name: string): IntakeTarget | null {
  const n = name.toLowerCase().replace(/[_\-.]+/g, " ");
  if (/\bk ?1\b|schedule k/.test(n)) return "schedule_k1";
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

/** Ready when investor, type are known and nothing has been decided. */
export function rowStatus(r: Pick<IntakeRow, "onboardingId" | "target" | "decision" | "readable">): "added" | "rejected" | "later" | "ready" | "review" | "unreadable" {
  if (r.decision === "approved") return "added";
  if (r.decision === "rejected") return "rejected";
  if (!r.readable) return "unreadable";
  if (r.decision === "later") return "later";
  return r.onboardingId && r.target ? "ready" : "review";
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
