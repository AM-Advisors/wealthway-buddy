/**
 * Sales outreach, pipeline and quoting rules (pure, no I/O).
 * Server functions re-derive every scope and approval from these rules.
 */

export const OUTREACH_CHANNELS = ["email", "text", "whatsapp", "linkedin", "call", "event", "other"] as const;
export type OutreachChannel = (typeof OUTREACH_CHANNELS)[number];
export const CHANNEL_LABEL: Record<OutreachChannel, string> = {
  email: "Email", text: "Text", whatsapp: "WhatsApp", linkedin: "LinkedIn", call: "Call", event: "Event", other: "Other",
};

export const SALES_STAGES = [
  "outreach", "connected", "meeting_set", "meeting_held", "quoted", "contract_sent", "contract_won", "contract_lost", "contact_later",
] as const;
export type SalesStage = (typeof SALES_STAGES)[number];
export const STAGE_LABEL: Record<SalesStage, string> = {
  outreach: "Outreach", connected: "Connected", meeting_set: "Meeting set", meeting_held: "Meeting held", quoted: "Quoted",
  contract_sent: "Contract sent", contract_won: "Contract won", contract_lost: "Contract lost", contact_later: "Contact later",
};
export const CONNECT_CHANNELS = ["email", "linkedin", "call", "whatsapp"] as const;
/** Probability used for the weighted forecast. */
export const STAGE_WEIGHT: Record<SalesStage, number> = {
  outreach: 0.02, connected: 0.05, meeting_set: 0.15, meeting_held: 0.25, quoted: 0.45, contract_sent: 0.7,
  contract_won: 1, contract_lost: 0, contact_later: 0.03,
};
/** Stages that count as "connected or beyond" for the connect rate. */
export const CONNECTED_OR_BEYOND: readonly SalesStage[] = ["connected", "meeting_set", "meeting_held", "quoted", "contract_sent", "contract_won", "contract_lost"];
export const OPEN_STAGES: readonly SalesStage[] = ["outreach", "connected", "meeting_set", "meeting_held", "quoted", "contract_sent", "contact_later"];

/** Map legacy crm_deals stages onto the sales pipeline. */
export function normalizeStage(stage: string | null | undefined): SalesStage {
  const s = String(stage ?? "").toLowerCase();
  if ((SALES_STAGES as readonly string[]).includes(s)) return s as SalesStage;
  if (s === "won") return "contract_won";
  if (s === "lost") return "contract_lost";
  if (s === "proposal" || s === "quote") return "quoted";
  if (s === "qualified" || s === "contacted") return "connected";
  if (s === "meeting") return "meeting_set";
  if (s === "committed") return "contract_sent";
  return "outreach";
}

/** Legacy crm_deals.stage kept in step for the existing Contacts & deals page. */
export function legacyStage(stage: SalesStage): string {
  return ({ outreach: "lead", connected: "contacted", meeting_set: "meeting", meeting_held: "meeting", quoted: "proposal",
    contract_sent: "committed", contract_won: "won", contract_lost: "lost", contact_later: "lead" } as const)[stage];
}

export const ALL_SCOPE_ROLES = ["cro", "executive", "super_admin", "admin"];
export const MANAGER_ROLES = ["sales_management"];
export const REP_ROLES = ["account_executive", "bdr", "sales", "account_manager"];
export type SalesScope = "all" | "team" | "own" | "none";

export function salesScope(roles: readonly string[]): SalesScope {
  if (roles.some((r) => ALL_SCOPE_ROLES.includes(r))) return "all";
  if (roles.some((r) => MANAGER_ROLES.includes(r))) return "team";
  if (roles.some((r) => REP_ROLES.includes(r))) return "own";
  return "none";
}

/** BDRs work leads up to Meeting set; later stages belong to an AE or above. */
export function canMoveToStage(roles: readonly string[], stage: SalesStage): boolean {
  const scope = salesScope(roles);
  if (scope === "none") return false;
  if (scope === "own" && roles.includes("bdr") && !roles.some((r) => ["account_executive", "sales", "account_manager"].includes(r))) {
    return ["outreach", "connected", "meeting_set", "contact_later"].includes(stage);
  }
  return true;
}

export const canDraftQuote = (roles: readonly string[]) =>
  roles.some((r) => ["account_executive", "sales", "sales_management", "cro", "executive", "super_admin"].includes(r));
export const canManageTeam = (roles: readonly string[]) => salesScope(roles) === "all" || salesScope(roles) === "team";
export const EXEC_PRICE_ROLES = ["executive", "cro", "super_admin"];

/** Below-baseline quotes need CEO/CRO; at/above baseline a Sales Manager may approve. Never the drafter. */
export function quoteApprovalProblem(args: { actorId: string; actorRoles: readonly string[]; createdBy: string; needsExec: boolean }): string | null {
  if (args.actorId === args.createdBy) return "The person who drafted a quote can't approve it.";
  if (args.needsExec) return args.actorRoles.some((r) => EXEC_PRICE_ROLES.includes(r)) ? null : "Below-baseline pricing needs the CEO or CRO.";
  return args.actorRoles.some((r) => [...EXEC_PRICE_ROLES, "sales_management"].includes(r)) ? null : "A Sales Manager, CRO or CEO must approve this quote.";
}

export type QuoteLineInput = { serviceKey: string; label: string; quantity: number; unitCents: number; baselineUnitCents: number };
export function priceQuote(lines: readonly QuoteLineInput[]) {
  const priced = lines.map((l) => ({ ...l, lineCents: Math.round(l.quantity * l.unitCents) }));
  const total = priced.reduce((a, l) => a + l.lineCents, 0);
  const baseline = priced.reduce((a, l) => a + Math.round(l.quantity * l.baselineUnitCents), 0);
  const belowBaseline = priced.some((l) => l.unitCents < l.baselineUnitCents);
  return { lines: priced, totalCents: total, baselineCents: baseline, needsExecApproval: belowBaseline };
}

export type PeriodKey = "day" | "week" | "month" | "quarter" | "year" | "custom";
/** Inclusive start, exclusive end, as ISO strings (UTC). */
export function periodRange(period: PeriodKey, now = new Date(), custom?: { from?: string | undefined; to?: string  | undefined}): { from: string; to: string } {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let start = new Date(d);
  let end = new Date(d);
  if (period === "custom" && custom?.from && custom?.to) {
    const e = new Date(custom.to + "T00:00:00Z"); e.setUTCDate(e.getUTCDate() + 1);
    return { from: new Date(custom.from + "T00:00:00Z").toISOString(), to: e.toISOString() };
  }
  if (period === "day") end.setUTCDate(end.getUTCDate() + 1);
  else if (period === "week") { const dow = (d.getUTCDay() + 6) % 7; start.setUTCDate(d.getUTCDate() - dow); end = new Date(start); end.setUTCDate(start.getUTCDate() + 7); }
  else if (period === "month") { start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)); end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)); }
  else if (period === "quarter") { const q = Math.floor(d.getUTCMonth() / 3) * 3; start = new Date(Date.UTC(d.getUTCFullYear(), q, 1)); end = new Date(Date.UTC(d.getUTCFullYear(), q + 3, 1)); }
  else { start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1)); end = new Date(Date.UTC(d.getUTCFullYear() + 1, 0, 1)); }
  return { from: start.toISOString(), to: end.toISOString() };
}

export const QUOTE_STATUS_LABEL: Record<string, string> = {
  draft: "Draft", pending_approval: "Awaiting approval", approved: "Approved", rejected: "Changes requested",
  sent: "Sent", signed: "Signed", lost: "Lost", superseded: "Replaced by newer version",
};
