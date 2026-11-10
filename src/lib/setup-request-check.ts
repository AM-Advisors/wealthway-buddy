/**
 * Fund request answers ↔ Fund Setup check (pure, read-only).
 * Lists every answer the client gave on the fund request (new or older intake form)
 * beside where it lives in Setup, and says whether Setup already has it. It never
 * writes, never marks anything complete and never shows tax identifiers.
 */

export type SetupSnapshot = {
  legalName: string | null;
  displayName: string | null;
  fundType: string | null;
  entityType: string | null;
  jurisdiction: string | null;
  formationDate: string | null;
  regType: string | null;
  targetRaiseCents: number | null;
  minInvestmentCents: number | null;
  offeringCloseDate: string | null;
  gpName: string | null;
  signatoryNames: string[];
  signatoryTitles: string[];
  teamNames: string[];
  managementFeePct: number | null;
  carryPct: number | null;
  preferredReturnPct: number | null;
  fundTermMonths: number | null;
  investmentPeriodMonths: number | null;
  classNames: string[];
  hasEin: boolean;
  bankingStarted: boolean;
  documentCount: number;
  serviceProviders: Record<string, string | null>;
  investmentStrategy: string | null;
};

/** Where in Setup an answer belongs (matches the setup page section ids). */
export const SETUP_PLACES = {
  basic: "Basic Details",
  details: "Fund Details",
  jurisdiction: "Jurisdiction",
  ein: "EIN",
  fees: "Fees & Terms",
  team: "Team & Signatory",
  bank: "Banking",
  documents: "Documents",
  admin: "Administration (Harmonious)",
} as const;
export type SetupPlace = keyof typeof SETUP_PLACES;

export type CheckState = "in_setup" | "changed" | "missing" | "reference";
export type CheckRow = { key: string; question: string; answer: string; setupValue: string | null; place: SetupPlace; state: CheckState };

type Ans = { key: string; question: string; answer: string; place: SetupPlace; setup: (s: SetupSnapshot) => string | null; same?: (a: string, s: string, snap: SetupSnapshot) => boolean; reference?: boolean };

const norm = (v: string | null | undefined) => String(v ?? "").toLowerCase().replace(/[^a-z0-9.]+/g, " ").trim();
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const pct = (v: string) => { const m = v.match(/-?\d+(?:\.\d+)?/); return m ? Number(m[0]) : null; };
const dollars = (v: string) => { const n = Number(v.replace(/[^0-9.]/g, "")); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null; };
const money = (c: number | null) => (c == null ? null : `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`);
const months = (v: string) => { const n = pct(v); if (n == null) return null; return /year|yr/i.test(v) ? Math.round(n * 12) : Math.round(n); };
const pctText = (n: number | null) => (n == null ? null : `${n}%`);
const nameIn = (list: string[], name: string) => list.some((n) => norm(n) === norm(name));

const REG_LABEL: Record<string, string> = { "506b": "506(b)", "506c": "506(c)", regcf: "Reg CF", rega: "Reg A", regaplus: "Reg A+" };
const regText = (v: string | null) => (v ? REG_LABEL[v] ?? v : null);
const sameReg = (a: string, s: string) => norm(a).replace(/[^a-z0-9]/g, "").startsWith(norm(s).replace(/[^a-z0-9]/g, "")) || norm(regText(s)).replace(/ /g, "") === norm(a).replace(/ /g, "");

/** Normalizes both request forms into one list of answers with their Setup home. */
export function requestAnswers(details: Record<string, any> | null | undefined): Ans[] {
  if (!details || typeof details !== "object") return [];
  const v2 = details["_kind"] === "fund_request_v2" || "vehicle_structure" in details || "offering_exemption" in details;
  const out: Ans[] = [];
  const add = (a: Ans) => { if (a.answer) out.push(a); };
  const nums = (a: string, s: string, f: (x: string) => number | null) => f(a) != null && f(a) === f(s);

  const fundName = str(details["fund_name"]);
  const legal = str(v2 ? details["legal_name"] : details["legal_entity_name"]);
  add({ key: "fund_name", question: "Fund name", answer: fundName, place: "details", setup: (s) => s.displayName });
  add({ key: "legal_name", question: "Legal name", answer: legal, place: "basic", setup: (s) => s.legalName });
  add({ key: "fund_type", question: "Fund type", answer: str(details["fund_type"]) || str(details["kind"]).replace(/_/g, " "), place: "basic", setup: (s) => s.fundType, same: (a, s) => norm(s).includes(norm(a)) || norm(a).includes(norm(s)) || (norm(a) === "spv" && norm(s).includes("spv")) });
  add({ key: "entity_type", question: "Entity type", answer: str(v2 ? details["vehicle_structure"] : details["entity_type"]), place: "basic", setup: (s) => s.entityType, same: (a, s) => norm(a).includes(norm(s)) || norm(s).includes(norm(a)) });
  add({ key: "jurisdiction", question: "State of formation", answer: str(v2 ? details["jurisdiction"] : details["state_formed"]), place: "jurisdiction", setup: (s) => s.jurisdiction });
  add({ key: "date_formed", question: "Formation date", answer: str(details["date_formed"]), place: "details", setup: (s) => s.formationDate });
  add({ key: "reg_type", question: "Offering exemption", answer: v2 ? (str(details["offering_exemption"]) === "Not sure" ? "" : str(details["offering_exemption"])) : regText(str(details["reg_type"]) || null) ?? "", place: "basic", setup: (s) => regText(s.regType), same: (a, s) => sameReg(a, s) });
  add({ key: "target_raise", question: "Target raise", answer: str(details["target_raise"]), place: "details", setup: (s) => money(s.targetRaiseCents), same: (a, s) => nums(a, s, dollars) });
  add({ key: "minimum", question: "Minimum investment", answer: str(v2 ? details["minimum_investment"] : details["min_investment"]), place: "details", setup: (s) => (s.minInvestmentCents ? money(s.minInvestmentCents) : null), same: (a, s) => nums(a, s, dollars) });
  add({ key: "expected_close", question: "Expected close", answer: str(details["expected_close"]), place: "details", setup: (s) => s.offeringCloseDate, same: (a, s) => !/^\d{4}-\d{2}-\d{2}$/.test(a) || a === s });

  // People
  const gp = v2 ? (Array.isArray(details["managers"]) ? details["managers"] : []).map((m: any) => str(m?.name)).filter(Boolean) : [str(details["general_partner"]?.name)].filter(Boolean);
  const gpFirm = v2 ? "" : str(details["general_partner"]?.firm);
  if (gp.length || gpFirm) add({ key: "managers", question: "Fund manager", answer: [...gp, gpFirm].filter(Boolean).join(", "), place: "basic", setup: (s) => s.gpName, same: (_a, s) => [...gp, gpFirm].some((n) => n && (norm(s).includes(norm(n)) || norm(n).includes(norm(s)))) });
  for (const n of gp) add({ key: `team_${norm(n)}`, question: "Team member", answer: n, place: "team", setup: (s) => (nameIn([...s.teamNames, ...s.signatoryNames], n) ? n : null) });
  const signer = str(details["signatory"]?.name);
  add({ key: "signatory", question: "Fund signatory", answer: signer, place: "team", setup: (s) => (nameIn(s.signatoryNames, signer) ? signer : s.signatoryNames.join(", ") || null), same: (_a, _s, snap) => nameIn(snap.signatoryNames, signer) });
  const title = str(details["signatory"]?.title);
  add({ key: "signatory_title", question: "Signatory title", answer: title, place: "team", setup: (s) => s.signatoryTitles.join(", ") || null, same: (a, _s, snap) => snap.signatoryTitles.some((t) => norm(t) === norm(a)) });

  // Fees, terms and classes
  add({ key: "management_fee", question: "Management fee", answer: str(details["management_fee"]), place: "fees", setup: (s) => pctText(s.managementFeePct), same: (a, s) => nums(a, s, pct) || (/not applicable|none/i.test(a) && pct(s) === 0) });
  add({ key: "carry", question: "Carried interest", answer: str(details["carried_interest"]), place: "fees", setup: (s) => pctText(s.carryPct), same: (a, s) => nums(a, s, pct) || (/not applicable|none/i.test(a) && pct(s) === 0) });
  add({ key: "preferred_return", question: "Preferred return", answer: str(details["preferred_return"]), place: "fees", setup: (s) => pctText(s.preferredReturnPct), same: (a, s) => nums(a, s, pct) });
  add({ key: "fund_term", question: "Fund term", answer: str(details["fund_term"]), place: "details", setup: (s) => (s.fundTermMonths == null ? null : `${s.fundTermMonths} months`), same: (a, s) => months(a) === pct(s) });
  add({ key: "investment_period", question: "Investment period", answer: str(details["investment_period"]), place: "details", setup: (s) => (s.investmentPeriodMonths == null ? null : `${s.investmentPeriodMonths} months`), same: (a, s) => months(a) === pct(s) });
  const classes = (Array.isArray(details["classes"]) ? details["classes"] : []).filter((c: any) => str(c?.name) && (str(c?.fee) || str(c?.carry) || str(c?.hurdle) || str(c?.minimum)));
  if (classes.length > 1) {
    for (const c of classes) {
      const name = str(c.name);
      const terms = [c.fee && `fee ${c.fee}`, c.carry && `carry ${c.carry}`, c.hurdle && `hurdle ${c.hurdle}`, c.minimum && `minimum ${c.minimum}`].filter(Boolean).join(", ");
      add({ key: `class_${norm(name)}`, question: `Class: ${name}`, answer: terms || name, place: "fees", setup: (s) => (nameIn(s.classNames, name) ? name : null), same: () => true });
    }
  }

  // Entity, banking, documents, providers
  const hasEin = v2 ? str(details["has_ein"]) : details["has_ein"] === true ? "yes" : details["has_ein"] === false ? "" : "";
  if (hasEin === "yes") add({ key: "ein", question: "Fund already has an EIN", answer: "Yes", place: "ein", setup: (s) => (s.hasEin ? "Recorded" : null), same: () => true });
  const bank = str(details["bank_name"]) || str(details["bank_or_custodian"]);
  add({ key: "bank", question: "Bank", answer: bank, place: "bank", setup: (s) => (s.bankingStarted ? "Bank setup started" : null), same: () => true });
  const docs = Array.isArray(details["documents"]) ? details["documents"].filter((d: any) => str(d?.fileName)) : [];
  if (docs.length) add({ key: "documents", question: "Documents uploaded with the request", answer: docs.map((d: any) => `${str(d.kind) || "Document"}: ${str(d.fileName)}`).join("; "), place: "documents", setup: (s) => (s.documentCount ? `${s.documentCount} on file` : null), same: () => true });
  const providers: [string, string, string][] = v2
    ? [["counsel", "Fund counsel", "counsel"], ["auditor", "Auditor", "auditor"]]
    : [["lawyer", "Fund counsel", "counsel"], ["accountant", "Accountant", "auditor"]];
  for (const [k, q, sk] of providers) {
    const a = v2 ? str(details[k]) : [str(details[k]?.name), str(details[k]?.firm)].filter(Boolean).join(", ");
    add({ key: `provider_${k}`, question: q, answer: a, place: "admin", setup: (s) => s.serviceProviders[sk] ?? null, same: () => true });
  }
  add({ key: "investment_asset", question: "Investment", answer: str(details["investment_asset"]), place: "admin", setup: (s) => s.investmentStrategy, same: () => true });

  // Answers that have no Setup field: shown so a person checks them, never auto-applied.
  for (const [k, q, place] of [["investor_eligibility", "Investor eligibility", "admin"], ["gp_commitment", "GP commitment", "fees"], ["expected_investors", "Expected investors", "details"], ["distribution_source", "Distribution source", "bank"], ["notes", "Notes to Harmonious", "admin"]] as [string, string, SetupPlace][]) {
    add({ key: k, question: q, answer: str(details[k]), place, setup: () => null, reference: true });
  }
  return out;
}

/** Compares each request answer with Setup. Differences are informational: Setup wins. */
export function checkRequestAgainstSetup(details: Record<string, any> | null | undefined, snap: SetupSnapshot): CheckRow[] {
  return requestAnswers(details).map((a) => {
    const setupValue = a.setup(snap);
    const state: CheckState = a.reference ? "reference" : !setupValue ? "missing" : (a.same ? a.same(a.answer, setupValue, snap) : norm(a.answer) === norm(setupValue)) ? "in_setup" : "changed";
    return { key: a.key, question: a.question, answer: a.answer, setupValue, place: a.place, state };
  });
}

export type QuestionsStatus = { state: "none" | "draft" | "approved" | "approved_with_draft"; approvedVersion: number | null; draftVersion: number | null; questionCount: number; next: string | null };

/** The fund's additional investor questions, as Setup should show them. */
export function questionsStatus(rows: { status: string; version: number; questions?: unknown }[]): QuestionsStatus {
  const approved = rows.filter((r) => r.status === "approved").sort((a, b) => b.version - a.version)[0] ?? null;
  const draft = rows.filter((r) => r.status === "draft").sort((a, b) => b.version - a.version)[0] ?? null;
  const count = (r: typeof approved) => (r && Array.isArray(r.questions) ? r.questions.length : 0);
  if (draft) return { state: approved ? "approved_with_draft" : "draft", approvedVersion: approved?.version ?? null, draftVersion: draft.version, questionCount: count(draft), next: "Approve the additional investor questions" };
  if (approved) return { state: "approved", approvedVersion: approved.version, draftVersion: null, questionCount: count(approved), next: null };
  return { state: "none", approvedVersion: null, draftVersion: null, questionCount: 0, next: null };
}

export function checkSummary(rows: CheckRow[], questions: QuestionsStatus) {
  const missing = rows.filter((r) => r.state === "missing");
  const changed = rows.filter((r) => r.state === "changed");
  const toDo = [...missing.map((r) => `Add "${r.question}" in ${SETUP_PLACES[r.place]}`), ...(questions.next ? [questions.next] : [])];
  return { missing: missing.length, changed: changed.length, inSetup: rows.filter((r) => r.state === "in_setup").length, reference: rows.filter((r) => r.state === "reference").length, toDo };
}
