/**
 * Yearly state entity filings (franchise tax, annual report/list, biennial
 * statement) by state and entity kind. Pure, record-only: nothing here files
 * or pays. Fees come from each state's official site as of LAST_CHECKED; a
 * null fee means "varies / needs review", never a guess.
 */
import { normalizeUsState } from "@/lib/regulatory-filings-model";

export const LAST_CHECKED = "2026-11-18";
export type EntityKind = "LLC" | "LP";
export type DueRule =
  | { kind: "fixed"; month: number; day: number }
  | { kind: "anniversary_first" }        // first day of formation-anniversary month
  | { kind: "anniversary_last" }         // last day of formation-anniversary month
  | { kind: "biennial_anniversary_last" }; // every 2 years, end of anniversary month
export type StateFilingRule = {
  state: string; entity: EntityKind; filing: string; due: DueRule; feeCents: number | null;
  penalty: string; fileAt: string; source: string; bring: string[];
};

const base = ["EIN", "Registered agent name and address", "Principal office address", "Names of managers or general partner"];
const R = (state: string, entity: EntityKind, filing: string, due: DueRule, feeCents: number | null, penalty: string, fileAt: string, extra: string[] = []): StateFilingRule =>
  ({ state, entity, filing, due, feeCents, penalty, fileAt, source: fileAt, bring: [...base, ...extra] });

const DE = "https://corp.delaware.gov/paytaxes/";
const TX = "https://comptroller.texas.gov/taxes/franchise/";
const WY = "https://wyobiz.wyo.gov/Business/AnnualReport.aspx";
const NV = "https://www.nvsilverflume.gov/";
const CA = "https://www.ftb.ca.gov/file/business/types/limited-liability-company/index.html";
const NY = "https://dos.ny.gov/biennial-statements-business-corporations-and-limited-liability-companies";
const FL = "https://dos.fl.gov/sunbiz/manage-business/efile/annual-report/";
const IL = "https://www.ilsos.gov/departments/business_services/";

export const STATE_FILING_RULES: StateFilingRule[] = [
  R("DE", "LLC", "Delaware annual franchise tax", { kind: "fixed", month: 6, day: 1 }, 30000, "$200 late penalty plus 1.5% interest per month", DE, ["Delaware file number"]),
  R("DE", "LP", "Delaware annual franchise tax", { kind: "fixed", month: 6, day: 1 }, 30000, "$200 late penalty plus 1.5% interest per month", DE, ["Delaware file number"]),
  R("TX", "LLC", "Texas franchise tax report and Public Information Report", { kind: "fixed", month: 5, day: 15 }, null, "$50 late filing fee; tax due varies with revenue", TX, ["Texas taxpayer number", "Annual revenue"]),
  R("TX", "LP", "Texas franchise tax report and Public Information Report", { kind: "fixed", month: 5, day: 15 }, null, "$50 late filing fee; tax due varies with revenue", TX, ["Texas taxpayer number", "Annual revenue"]),
  R("WY", "LLC", "Wyoming annual report", { kind: "anniversary_first" }, 6000, "Entity may be dissolved 60 days after due date", WY, ["Wyoming assets located in state"]),
  R("WY", "LP", "Wyoming annual report", { kind: "anniversary_first" }, 6000, "Entity may be dissolved 60 days after due date", WY, ["Wyoming assets located in state"]),
  R("NV", "LLC", "Nevada annual list and state business license", { kind: "anniversary_last" }, 35000, "$75 late penalty", NV),
  R("NV", "LP", "Nevada annual list and state business license", { kind: "anniversary_last" }, 35000, "$75 late penalty", NV),
  R("CA", "LLC", "California annual LLC tax (Form 3522)", { kind: "fixed", month: 4, day: 15 }, 80000, "Penalties and interest from the due date", CA, ["California Secretary of State file number"]),
  R("CA", "LP", "California annual LP tax (Form 3522 equivalent, Form 3538)", { kind: "fixed", month: 4, day: 15 }, 80000, "Penalties and interest from the due date", CA, ["California Secretary of State file number"]),
  R("NY", "LLC", "New York biennial statement", { kind: "biennial_anniversary_last" }, 900, "Status shown as past due on state record", NY),
  R("FL", "LLC", "Florida annual report", { kind: "fixed", month: 5, day: 1 }, 13875, "$400 late fee after May 1", FL, ["Florida document number"]),
  R("FL", "LP", "Florida annual report", { kind: "fixed", month: 5, day: 1 }, 50000, "$400 late fee after May 1", FL, ["Florida document number"]),
  R("IL", "LLC", "Illinois LLC annual report", { kind: "anniversary_first" }, 7500, "$100 late penalty", IL, ["Illinois file number"]),
  R("IL", "LP", "Illinois LP annual report", { kind: "anniversary_first" }, null, "Late penalty applies", IL, ["Illinois file number"]),
];

export const entityKindOf = (entityType: string | null | undefined): EntityKind => (/\blp\b|partnership/i.test(entityType ?? "") ? "LP" : "LLC");
export const ruleFor = (state: string, entity: EntityKind) => STATE_FILING_RULES.find((r) => r.state === state && r.entity === entity) ?? null;

/** Pull a two-letter state from the end of a US address ("..., Austin, TX 78701"). */
export function stateFromAddress(addr: string | null | undefined): string | null {
  if (!addr) return null;
  const m = addr.match(/,\s*([A-Za-z .]+?)\s+\d{5}(-\d{4})?\s*(,\s*(USA|United States))?\s*$/i) ?? addr.match(/,\s*([A-Za-z]{2})\s*$/);
  return m ? normalizeUsState(m[1]) : null;
}

const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
/** Saturday/Sunday due dates move to the next Monday (holidays: confirm with the state). */
export function nextBusinessDay(d: string): string {
  const x = new Date(d + "T00:00:00Z"); const w = x.getUTCDay();
  if (w === 6) x.setUTCDate(x.getUTCDate() + 2); else if (w === 0) x.setUTCDate(x.getUTCDate() + 1);
  return x.toISOString().slice(0, 10);
}

/** Due date for a filing year, or null when the rule needs a formation date we don't have. */
export function dueDateFor(rule: StateFilingRule, year: number, formedOn: string | null): string | null {
  const due = rule.due;
  if (due.kind === "fixed") return nextBusinessDay(iso(year, due.month, due.day));
  if (!formedOn) return null;
  const fy = Number(formedOn.slice(0, 4)); const fm = Number(formedOn.slice(5, 7));
  if (due.kind === "anniversary_first") return nextBusinessDay(iso(year, fm, 1));
  if (due.kind === "biennial_anniversary_last" && (year - fy) % 2 !== 0) return null;
  return nextBusinessDay(iso(year, fm, lastDay(year, fm)));
}

/** Next unfiled due date on/after the year after formation, skipping years already filed. */
export function nextDue(rule: StateFilingRule, formedOn: string | null, filedYears: number[], today: string): { year: number; due: string } | null {
  const startYear = formedOn ? Number(formedOn.slice(0, 4)) + 1 : Number(today.slice(0, 4));
  const filed = new Set(filedYears);
  for (let y = startYear; y <= Number(today.slice(0, 4)) + 3; y++) {
    const due = dueDateFor(rule, y, formedOn);
    if (due && !filed.has(y)) return { year: y, due };
  }
  return null;
}

export type FilingUrgency = "past_due" | "due_soon" | "upcoming" | "filed";
export function urgency(due: string | null, today: string, filed = false): FilingUrgency {
  if (filed) return "filed";
  if (!due) return "upcoming";
  if (due < today) return "past_due";
  const days = (Date.parse(due) - Date.parse(today)) / 86400000;
  return days <= 30 ? "due_soon" : "upcoming";
}
/** Reminder windows: 60, 30, 7 days before, and past due. */
export function reminderStage(due: string, today: string): 60 | 30 | 7 | "past_due" | null {
  const days = Math.round((Date.parse(due) - Date.parse(today)) / 86400000);
  if (days < 0) return "past_due"; if (days <= 7) return 7; if (days <= 30) return 30; if (days <= 60) return 60; return null;
}
