/**
 * Client self-service — pure presentation over existing authoritative records.
 *
 * Nothing here stores a status. Fund-request lifecycle labels are read from
 * fund_requests + fund_setups + fund_setup_tasks; milestones group the
 * existing setup sections; the investor list parser only prepares rows for
 * review — sending always happens one invitation at a time through the
 * existing invitation function.
 */

export const FUND_REQUEST_KINDS = [
  { value: "spv", label: "SPV", fundType: "spv" },
  { value: "venture", label: "Venture Fund", fundType: "venture_capital" },
  { value: "private_equity", label: "Private Equity Fund", fundType: "private_equity" },
  { value: "hedge", label: "Hedge Fund", fundType: "hedge_fund" },
  { value: "other", label: "Other", fundType: "other" },
] as const;
export type FundRequestKind = (typeof FUND_REQUEST_KINDS)[number]["value"];

export type RequestLifecycle =
  | "Draft"
  | "Submitted"
  | "Harmonious Review"
  | "Setup in Progress"
  | "Client Action Required"
  | "Ready";

type SetupLike = { stage?: string | null; launch_state?: string | null; launched_at?: string | null } | null;
type TaskLike = { section: string; status: string; responsible_party?: string | null; client_editable?: boolean | null };

/** Derived only; never written back. */
export function requestLifecycle(
  request: { status?: string | null; offering_id?: string | null },
  setup: SetupLike,
  tasks: readonly TaskLike[] = [],
): RequestLifecycle {
  const status = String(request.status ?? "");
  if (status === "draft") return "Draft";
  if (setup?.launched_at || setup?.launch_state === "launched" || setup?.stage === "ready_to_launch") return "Ready";
  if (tasks.some((t) => t.status === "waiting_on_client")) return "Client Action Required";
  if (setup) return "Setup in Progress";
  if (status === "submitted") return "Submitted";
  return "Harmonious Review";
}

export const MILESTONES = [
  { key: "details", label: "Fund details", sections: ["client", "fund_information", "economics", "investment"] },
  { key: "entity", label: "Entity", sections: ["entity"] },
  { key: "documents", label: "Fund documents", sections: ["documents"] },
  { key: "banking", label: "Banking", sections: ["banking"] },
  { key: "offering", label: "Offering / regulatory setup", sections: ["compliance", "offering"] },
  { key: "investors", label: "Investor onboarding", sections: ["investor_requirements"] },
  { key: "accounting", label: "Accounting & tax setup", sections: ["tax_setup", "accounting_book", "reporting_configuration"] },
] as const;

export type MilestoneState = "Complete" | "Waiting on you" | "Harmonious is working on it" | "Needs review";

export function milestoneState(tasks: readonly TaskLike[]): MilestoneState {
  if (tasks.length && tasks.every((t) => t.status === "complete" || t.status === "not_applicable")) return "Complete";
  if (tasks.some((t) => t.status === "waiting_on_client")) return "Waiting on you";
  if (tasks.some((t) => t.status === "in_review" || t.status === "blocked")) return "Needs review";
  return "Harmonious is working on it";
}

export function milestones(tasks: readonly TaskLike[]) {
  return MILESTONES.map((m) => {
    const own = tasks.filter((t) => (m.sections as readonly string[]).includes(t.section));
    return { key: m.key, label: m.label, state: milestoneState(own) };
  });
}

/* ------------------------------------------------------ bulk investor rows */

export type InvestorRow = {
  line: number;
  name: string;
  email: string;
  amountCents: number | null;
  investorType: string;
  errors: string[];
};

const TYPES = new Set(["individual", "joint", "entity", "trust", "ira", "unknown", ""]);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/**
 * Parse "name,email,amount,type" rows (header optional). Returns every row
 * with its own errors so the manager reviews before anything is sent.
 * Duplicates are flagged against earlier rows and against `existingEmails`.
 */
export function parseInvestorCsv(text: string, existingEmails: readonly string[] = []): InvestorRow[] {
  const existing = new Set(existingEmails.map((e) => e.toLowerCase()));
  const seen = new Set<string>();
  const lines = text.replace(/\r/g, "").split("\n");
  const rows: InvestorRow[] = [];
  lines.forEach((raw, idx) => {
    if (!raw.trim()) return;
    const cells = splitCsvLine(raw);
    if (idx === 0 && cells.some((c) => /email/i.test(c))) return; // header
    const [name = "", emailRaw = "", amountRaw = "", typeRaw = ""] = cells;
    const email = emailRaw.toLowerCase();
    const type = typeRaw.toLowerCase();
    const errors: string[] = [];
    if (!EMAIL.test(email)) errors.push("Email address is not valid");
    let amountCents: number | null = null;
    if (amountRaw) {
      const n = Number(amountRaw.replace(/[$,\s]/g, ""));
      if (!Number.isFinite(n) || n <= 0) errors.push("Amount must be a positive number");
      else amountCents = Math.round(n * 100);
    }
    if (!TYPES.has(type)) errors.push("Investor type not recognised");
    if (email && seen.has(email)) errors.push("Duplicate email in this file");
    if (email && existing.has(email)) errors.push("Already invited to this fund");
    if (email) seen.add(email);
    rows.push({ line: idx + 1, name, email, amountCents, investorType: type || "unknown", errors });
  });
  return rows;
}

/* ------------------------------------------------------------ cap table */

/** Ownership is always computed from recorded securities, never typed. */
export function ownershipFromSecurities(
  securities: readonly { stakeholder_id: string; quantity: number | string | null; status?: string | null; security_type?: string | null }[],
  opts: { fullyDiluted?: boolean } = {},
) {
  const COUNTS_OUTSTANDING = new Set(["common", "preferred", "spv_interest", "fund_interest"]);
  const NOT_DILUTED = new Set(["safe", "note", "other"]);
  const live = securities.filter((s) => !["cancelled", "void", "superseded", "transferred"].includes(String(s.status ?? "")));
  const pick = opts.fullyDiluted ? live.filter((s) => !NOT_DILUTED.has(String(s.security_type))) : live.filter((s) => COUNTS_OUTSTANDING.has(String(s.security_type)));
  const by = new Map<string, number>();
  for (const s of pick) by.set(s.stakeholder_id, (by.get(s.stakeholder_id) ?? 0) + Number(s.quantity ?? 0));
  const total = [...by.values()].reduce((a, b) => a + b, 0);
  return { total, holders: [...by.entries()].map(([id, qty]) => ({ stakeholderId: id, quantity: qty, percent: total ? (qty / total) * 100 : 0 })) };
}

export const STAKEHOLDER_TYPES = [
  ["founder", "Founder"],
  ["employee", "Employee"],
  ["investor", "Investor"],
  ["advisor", "Advisor"],
  ["entity", "Entity"],
  ["other", "Other"],
] as const;
