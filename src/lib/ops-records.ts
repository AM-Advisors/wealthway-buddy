/**
 * Records-first Harmonious Operations: the shape of Client 360, Fund/SPV 360,
 * Investor 360 and Company 360.
 *
 * Nothing here holds state. These are the rules for which tabs a staff member
 * may open, which actions their capabilities allow, what a record page is
 * allowed to show from an audit event, and where each summary value comes
 * from. The server re-checks every one of these rules on every request; a
 * visible tab is never permission.
 */

import { can, type OpsAction, type OpsArea, type OpsCapability } from "@/lib/ops-capabilities";

export const OPS_RECORD_TYPES = ["client", "fund", "investor", "company"] as const;
export type OpsRecordType = (typeof OPS_RECORD_TYPES)[number];

export type OpsRecordTab = {
  id: string;
  title: string;
  /** The capability area the backend checks before serving this tab. */
  area: OpsArea;
  /** Reachable by deep link but not shown in the tab bar. */
  hidden?: boolean;
};

/** The area that owns the record itself (its header and existence check). */
export const RECORD_AREA: Record<OpsRecordType, OpsArea> = {
  client: "clients",
  fund: "funds",
  investor: "investors",
  company: "companies",
};

export const RECORD_TABS: Record<OpsRecordType, OpsRecordTab[]> = {
  client: [
    { id: "overview", title: "Overview", area: "clients" },
    { id: "services", title: "Services", area: "clients" },
    { id: "contacts", title: "People & Team", area: "clients" },
    // Foundation Administration: feature-flagged. Hidden here; the record page shows it only while the flag is on.
    { id: "foundation", title: "Foundation", area: "clients", hidden: true },
    { id: "funds", title: "Funds & SPVs", area: "funds" },
    { id: "companies", title: "Companies / Cap Tables", area: "companies" },
    { id: "documents", title: "Documents", area: "documents" },
    { id: "tasks", title: "Tasks & Activity", area: "tasks" },
    { id: "access", title: "Client access", area: "clients", hidden: true },
    // Kept so existing deep links still open; not shown in the tab bar.
    { id: "relationships", title: "Relationships", area: "clients", hidden: true },
    { id: "investors", title: "Investors", area: "investors", hidden: true },
    { id: "activity", title: "Activity", area: "clients", hidden: true },
    { id: "contracts", title: "Contracts & SOWs", area: "clients", hidden: true },
  ],
  fund: [
    { id: "overview", title: "Overview", area: "funds" },
    { id: "investors", title: "Investors", area: "investors" },
    { id: "cap-table", title: "Cap Table", area: "investors" },
    { id: "investments", title: "Investments", area: "funds" },
    { id: "capital", title: "Capital", area: "capital" },
    { id: "banking", title: "Banking", area: "capital" },
    { id: "accounting", title: "Accounting", area: "accounting" },
    { id: "tax", title: "Tax", area: "tax" },
    { id: "regulatory", title: "Regulatory", area: "regulatory" },
    { id: "documents", title: "Documents", area: "documents" },
    { id: "side-letters", title: "Side Letters", area: "documents" },
    { id: "activity", title: "Activity", area: "funds" },
  ],
  investor: [
    { id: "overview", title: "Overview", area: "investors" },
    { id: "profiles", title: "Profiles", area: "investors" },
    { id: "investments", title: "Investments", area: "investors" },
    { id: "capital", title: "Capital", area: "capital" },
    { id: "tax", title: "Tax", area: "tax" },
    { id: "documents", title: "Documents", area: "documents" },
    { id: "identity", title: "Identity checks", area: "onboarding" },
    { id: "activity", title: "Activity", area: "investors" },
  ],
  company: [
    { id: "overview", title: "Overview", area: "companies" },
    { id: "cap-table", title: "Cap table", area: "companies" },
    { id: "stakeholders", title: "Stakeholders", area: "companies" },
    { id: "transactions", title: "Transactions", area: "companies" },
    { id: "documents", title: "Documents", area: "documents" },
    { id: "reports", title: "Reports", area: "reports" },
    { id: "activity", title: "Activity", area: "companies" },
  ],
};

/** Whether the record itself may be opened at all. */
export function canOpenRecord(
  type: OpsRecordType,
  capabilities: readonly OpsCapability[],
): boolean {
  return can(capabilities, RECORD_AREA[type], "see");
}

/** Only the tabs whose area this staff member may see, and only if the record may be opened. */
export function recordTabs(
  type: OpsRecordType,
  capabilities: readonly OpsCapability[],
): OpsRecordTab[] {
  if (!canOpenRecord(type, capabilities)) return [];
  return RECORD_TABS[type].filter((tab) => can(capabilities, tab.area, "see"));
}

export function tabDefinition(type: OpsRecordType, tabId: string): OpsRecordTab | null {
  return RECORD_TABS[type].find((tab) => tab.id === tabId) ?? null;
}

/** Whether this tab may be opened. An unknown tab is never allowed. */
export function canOpenTab(
  type: OpsRecordType,
  tabId: string,
  capabilities: readonly OpsCapability[],
): boolean {
  const tab = tabDefinition(type, tabId);
  return tab ? can(capabilities, tab.area, "see") : false;
}

/** The first tab this person may open, used when a link names one they may not. */
export function defaultTab(type: OpsRecordType, capabilities: readonly OpsCapability[]): string | null {
  return recordTabs(type, capabilities)[0]?.id ?? null;
}

export type ActionPermissions = Record<OpsAction, boolean>;

/** What the buttons on a tab may offer. The backend still decides. */
export function allowedActions(
  area: OpsArea,
  capabilities: readonly OpsCapability[],
): ActionPermissions {
  return {
    see: can(capabilities, area, "see"),
    prepare: can(capabilities, area, "prepare"),
    review: can(capabilities, area, "review"),
    approve: can(capabilities, area, "approve"),
    execute: can(capabilities, area, "execute"),
  };
}

/**
 * Bank detail is not handed over just because someone may open the fund.
 * Seeing the fund shows the institution and the state of the account; the
 * account itself needs the reviewing capability over capital.
 */
export function bankingDetailVisible(capabilities: readonly OpsCapability[]): boolean {
  return can(capabilities, "capital", "review");
}

export function maskAccount(value?: string | null): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length < 4) return "••••";
  return `••••${digits.slice(-4)}`;
}

/**
 * Anything a record page must never repeat out of an audit event or a record,
 * however it was named where it was stored.
 */
const RESTRICTED_KEY_PATTERN =
  /(password|secret|token|api[_-]?key|ssn|tax_id|tin|routing|account_number|iban|payload|raw_|document_body|file_contents|kyc_data|provider_response)/i;

export function isRestrictedField(key: string): boolean {
  return RESTRICTED_KEY_PATTERN.test(key);
}

export type ActivityEntry = {
  at: string;
  actor: string;
  capacity: string;
  action: string;
  resource: string;
  detail?: string | null;
};

/** Strip anything restricted out of a free-form detail object. */
export function redactDetail(detail: unknown): Record<string, unknown> {
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(detail as Record<string, unknown>)) {
    if (isRestrictedField(key)) continue;
    if (value && typeof value === "object") continue; // nested blobs stay out of Operations pages
    out[key] = value;
  }
  return out;
}

export function redactActivity(
  entry: Omit<ActivityEntry, "detail"> & { detail?: unknown },
): ActivityEntry {
  const detail = redactDetail(entry.detail);
  const keys = Object.keys(detail);
  return {
    at: entry.at,
    actor: entry.actor,
    capacity: entry.capacity,
    action: entry.action,
    resource: entry.resource,
    detail: keys.length ? keys.map((k) => `${k}: ${String(detail[k])}`).join(", ") : null,
  };
}

/**
 * Where every summary value on a record page comes from. A record page reads
 * these and only these - it never keeps a second copy of a status or balance.
 */
export const SUMMARY_SOURCES: Record<string, string> = {
  "client.status": "clients.status",
  "client.entityType": "client_entities.entity_type",
  "fund.status": "fund_setups.stage",
  "fund.launchState": "fund_setups.launch_state",
  "fund.commitmentCents": "investor_onboardings.accepted_amount_cents",
  "fund.fundedCents": "investor_onboardings.funded_amount_cents",
  "fund.investorCount": "investor_positions",
  "fund.navCents": "nav_versions.net_asset_value_cents",
  "fund.closeStatus": "accounting_periods.status",
  "fund.reportingStatus": "financial_reports.status",
  "investor.onboardingStage": "investor_onboardings.stage",
  "investor.kycStatus": "kyc_verifications.status",
  "investor.amlStatus": "aml_screenings.status",
  "investor.accreditationStatus": "accreditation_records.status",
  "company.authorizedShares": "ct_companies.authorized_shares",
  "company.outstanding": "ct_securities.quantity",
  "company.stakeholderCount": "ct_stakeholders",
};

/** Names a record page must never introduce: they would be a second truth. */
const FORBIDDEN_SUMMARY_SOURCES = /^(ops_|admin_|fund_360|record_)/;

export function summarySourcesAreAuthoritative(): boolean {
  return Object.values(SUMMARY_SOURCES).every((source) => !FORBIDDEN_SUMMARY_SOURCES.test(source));
}

/** Where a link from one record to another goes. Authorization is re-checked there. */
export function recordPath(type: OpsRecordType, id: string, tab?: string): string {
  const base = {
    client: "/ops/clients",
    fund: "/ops/fund",
    investor: "/ops/investors",
    company: "/ops/companies",
  }[type];
  const path = `${base}/${encodeURIComponent(id)}`;
  return tab ? `${path}?tab=${encodeURIComponent(tab)}` : path;
}

/* ------------------------------------------- investor list: client & funds */

export type InvestorFundLink = { fundId: string; fundName: string; clientId: string | null; clientName: string | null };

export type InvestorListRow = {
  id: string;
  title: string;
  subtitle: string | null;
  status: string | null;
  /** Furthest onboarding stage label across the investor's funds. */
  stage: string | null;
  clients: { id: string; name: string }[];
  funds: InvestorFundLink[];
};

const STAGE_RANK: Record<string, number> = {
  started: 1,
  profile_selected: 2,
  verification: 3,
  eligibility: 4,
  tax: 5,
  subscription: 6,
  signature: 7,
  harmonious_review: 8,
  approved_to_fund: 9,
  awaiting_funds: 10,
  funded: 11,
  accepted: 12,
  closed: 13,
  declined: 0,
  cancelled: 0,
};

const STAGE_LABEL: Record<string, string> = {
  started: "Started",
  profile_selected: "Profile chosen",
  verification: "Verification",
  eligibility: "Eligibility",
  tax: "Tax documentation",
  subscription: "Subscription",
  signature: "Signature",
  harmonious_review: "Investor signed: awaiting fund countersignature",
  approved_to_fund: "Approved to fund",
  awaiting_funds: "Awaiting funds",
  funded: "Funded",
  accepted: "Accepted",
  closed: "Closed / admitted",
  declined: "Declined",
  cancelled: "Cancelled",
};

/**
 * Attach each investor's clients and funds to their list row. Pure: the
 * server passes rows it already loaded; nothing is recalculated or stored.
 * Investors with no fund keep their row with empty clients/funds.
 */
export function attachInvestorRelations(
  profiles: { user_id: string; legal_name: string | null; email: string | null; investor_type: string | null }[],
  onboardings: { investor_user_id: string | null; offering_id: string | null; stage: string | null }[],
  offerings: { id: string; name: string; client_id: string | null }[],
  clients: { id: string; name: string }[],
): InvestorListRow[] {
  const offeringById = new Map(offerings.map((o) => [o.id, o]));
  const clientById = new Map(clients.map((c) => [c.id, c.name]));
  const byInvestor = new Map<string, { funds: Map<string, InvestorFundLink>; bestStage: string | null }>();

  for (const o of onboardings) {
    if (!o.investor_user_id || !o.offering_id) continue;
    const offering = offeringById.get(o.offering_id);
    if (!offering) continue;
    let entry = byInvestor.get(o.investor_user_id);
    if (!entry) {
      entry = { funds: new Map(), bestStage: null };
      byInvestor.set(o.investor_user_id, entry);
    }
    if (!entry.funds.has(offering.id)) {
      entry.funds.set(offering.id, {
        fundId: offering.id,
        fundName: offering.name,
        clientId: offering.client_id,
        clientName: offering.client_id ? (clientById.get(offering.client_id) ?? null) : null,
      });
    }
    const rank = STAGE_RANK[o.stage ?? ""] ?? 0;
    const best = STAGE_RANK[entry.bestStage ?? ""] ?? -1;
    if (rank > best) entry.bestStage = o.stage;
  }

  return profiles.map((p) => {
    const entry = byInvestor.get(p.user_id);
    const funds = entry ? [...entry.funds.values()].sort((a, b) => a.fundName.localeCompare(b.fundName)) : [];
    const clientMap = new Map<string, string>();
    for (const f of funds) {
      if (f.clientId && f.clientName) clientMap.set(f.clientId, f.clientName);
    }
    return {
      id: p.user_id,
      title: p.legal_name || p.email || "Unnamed person",
      subtitle: p.email,
      status: p.investor_type,
      stage: entry?.bestStage ? (STAGE_LABEL[entry.bestStage] ?? entry.bestStage) : null,
      clients: [...clientMap.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
      funds,
    };
  });
}

/* ------------------------------ investor directory: canonical records */

export type InvestorDirectoryRow = InvestorListRow & {
  /** Where "Open" goes: Investor 360 for a login, else the exact fund investor page. */
  openPath: string;
  /** Investing parties (trusts, LLCs, individuals) this person invests through. */
  parties: string[];
  /** True when the person has a portal login. */
  hasLogin: boolean;
  /** Marked as a test/demo person or login. */
  isTestDemo: boolean;
};

type DirPerson = { id: string; user_id: string | null; legal_first_name: string | null; legal_last_name: string | null; preferred_name: string | null; email: string | null; is_test_demo?: boolean | null };
type DirLogin = { user_id: string; legal_name: string | null; email: string | null; investor_type: string | null; is_test_demo?: boolean | null };
type DirOnboarding = { id: string; person_id: string | null; investor_user_id: string | null; offering_id: string | null; investment_profile_id: string | null; stage: string | null };
type DirProfile = { id: string; person_id: string | null; owner_user_id: string | null; legal_name: string | null; display_label: string | null; profile_type: string | null };

const ENTITY_TYPE_SHORT: Record<string, string> = {
  individual: "Individual", joint: "Joint", trust: "Trust", ira: "IRA", retirement_plan: "Retirement plan",
  llc: "LLC", corporation: "Corporation", partnership: "Partnership", family_office: "Family office", foundation: "Foundation", other_entity: "Entity",
};

/**
 * Every investor across all funds, from canonical records: one row per person
 * with a live investment (removed/merged onboardings excluded), whether or not
 * they have a login, plus login accounts that own an investing party but have
 * no investment yet. Harmonious staff emails never appear. Pure and read-only.
 */
export function buildInvestorDirectory(input: {
  persons: DirPerson[];
  logins: DirLogin[];
  onboardings: DirOnboarding[];
  profiles: DirProfile[];
  offerings: { id: string; name: string; client_id: string | null }[];
  clients: { id: string; name: string }[];
  isStaffEmail: (email: string | null | undefined) => boolean;
}): InvestorDirectoryRow[] {
  const offeringById = new Map(input.offerings.map((o) => [o.id, o]));
  const clientById = new Map(input.clients.map((c) => [c.id, c.name]));
  const loginById = new Map(input.logins.map((l) => [l.user_id, l]));
  const profileById = new Map(input.profiles.map((p) => [p.id, p]));
  const personById = new Map(input.persons.map((p) => [p.id, p]));
  const personByUser = new Map(input.persons.filter((p) => p.user_id).map((p) => [p.user_id!, p]));

  type Acc = { key: string; person: DirPerson | null; userId: string | null; onboardings: DirOnboarding[]; profileIds: Set<string> };
  const acc = new Map<string, Acc>();
  const get = (key: string, person: DirPerson | null, userId: string | null) => {
    let a = acc.get(key);
    if (!a) { a = { key, person, userId, onboardings: [], profileIds: new Set() }; acc.set(key, a); }
    if (!a.userId && userId) a.userId = userId;
    return a;
  };

  for (const o of input.onboardings) {
    if (!o.offering_id || !offeringById.has(o.offering_id)) continue;
    const person = (o.person_id ? personById.get(o.person_id) : undefined) ?? (o.investor_user_id ? personByUser.get(o.investor_user_id) : undefined) ?? null;
    const userId = person?.user_id ?? o.investor_user_id ?? null;
    const key = person ? `p:${person.id}` : userId ? `u:${userId}` : `o:${o.id}`;
    const a = get(key, person, userId);
    a.onboardings.push(o);
    if (o.investment_profile_id) a.profileIds.add(o.investment_profile_id);
  }

  // Logins that own an investing party but have not started an investment yet.
  for (const p of input.profiles) {
    const userId = p.owner_user_id;
    if (!userId || !loginById.has(userId)) continue;
    const person = personByUser.get(userId) ?? null;
    const key = person ? `p:${person.id}` : `u:${userId}`;
    if (acc.has(key)) continue;
    get(key, person, userId).profileIds.add(p.id);
  }

  const out: InvestorDirectoryRow[] = [];
  for (const a of acc.values()) {
    const login = a.userId ? loginById.get(a.userId) : undefined;
    const personName = a.person ? [a.person.legal_first_name, a.person.legal_last_name].filter(Boolean).join(" ").trim() || a.person.preferred_name?.trim() || "" : "";
    const email = a.person?.email || login?.email || null;
    if (input.isStaffEmail(email) || (login && input.isStaffEmail(login.email))) continue;
    const partyRows = [...a.profileIds].map((id) => profileById.get(id)).filter(Boolean) as DirProfile[];
    const parties = [...new Set(partyRows.map((p) => (p.legal_name || p.display_label || "").trim()).filter(Boolean))].sort((x, y) => x.localeCompare(y));
    const title = personName || login?.legal_name || parties[0] || email || "Unnamed person";

    const funds = new Map<string, InvestorFundLink>();
    let bestStage: string | null = null;
    let bestOnboarding: DirOnboarding | null = null;
    for (const o of a.onboardings) {
      const offering = offeringById.get(o.offering_id!)!;
      if (!funds.has(offering.id)) {
        funds.set(offering.id, { fundId: offering.id, fundName: offering.name, clientId: offering.client_id, clientName: offering.client_id ? (clientById.get(offering.client_id) ?? null) : null });
      }
      const rank = STAGE_RANK[o.stage ?? ""] ?? 0;
      if (!bestOnboarding || rank > (STAGE_RANK[bestStage ?? ""] ?? -1)) { bestStage = o.stage; bestOnboarding = o; }
    }
    const fundList = [...funds.values()].sort((x, y) => x.fundName.localeCompare(y.fundName));
    const clientMap = new Map<string, string>();
    for (const f of fundList) if (f.clientId && f.clientName) clientMap.set(f.clientId, f.clientName);
    const types = [...new Set(partyRows.map((p) => ENTITY_TYPE_SHORT[p.profile_type ?? ""] ?? null).filter(Boolean))] as string[];

    const openPath = a.userId
      ? `/ops/investors/${encodeURIComponent(a.userId)}`
      : bestOnboarding
        ? `/ops/fund/${encodeURIComponent(bestOnboarding.offering_id!)}/investor/${encodeURIComponent(bestOnboarding.id)}`
        : "/ops/investors";
    out.push({
      id: a.userId ?? a.key,
      title,
      subtitle: email,
      status: login?.investor_type || types.join(", ") || null,
      stage: bestStage ? (STAGE_LABEL[bestStage] ?? bestStage) : null,
      clients: [...clientMap.entries()].map(([id, name]) => ({ id, name })).sort((x, y) => x.name.localeCompare(y.name)),
      funds: fundList,
      openPath,
      parties: parties.filter((n) => n.toLowerCase() !== title.toLowerCase()),
      hasLogin: !!a.userId,
      isTestDemo: !!(a.person?.is_test_demo || login?.is_test_demo),
    });
  }
  // Group by fund so every investor in a fund sits together: sort by the
  // investor's first (alphabetical) fund, investors with no fund last, then
  // by name within each fund.
  return out.sort((x, y) => {
    const xf = x.funds[0]?.fundName;
    const yf = y.funds[0]?.fundName;
    if (xf && yf) {
      const byFund = xf.localeCompare(yf);
      if (byFund !== 0) return byFund;
    } else if (xf || yf) {
      return xf ? -1 : 1;
    }
    return x.title.localeCompare(y.title);
  });
}

/** Search matches the investor's name, email, client names and fund names. */
export function investorListMatches(row: InvestorListRow, search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  const parties = (row as Partial<InvestorDirectoryRow>).parties ?? [];
  const hay = [row.title, row.subtitle, ...parties, ...row.clients.map((c) => c.name), ...row.funds.map((f) => f.fundName)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(needle);
}

/* ------------------------------------ investor 360: canonical readiness */

type StageStatus = { stage: string; status: string };
export type InvestorCheckRow = {
  onboardingId: string;
  offering_id: string;
  fundName: string | null;
  profileLabel: string | null;
  stage: string | null;
  identity: string | null;
  eligibility: string | null;
  tax: string | null;
  subscription: string | null;
  funding: string | null;
  nextAction: string | null;
};

/**
 * Investor 360 check rows from the same canonical per-investment readiness the
 * fund investor page shows. Legacy application status columns are never used.
 */
export function investorCheckRows(
  onboardings: { id: string; offering_id: string; investment_profile_id: string | null; stage: string | null }[],
  results: { stages: StageStatus[]; nextAction: { label: string } | null }[],
  fundName: Map<string, string>,
  profileLabel: Map<string, string>,
): InvestorCheckRow[] {
  return onboardings.map((o, index) => {
    const r = results[index];
    const status = (stage: string) => r?.stages.find((s) => s.stage === stage)?.status ?? null;
    return {
      onboardingId: o.id,
      offering_id: o.offering_id,
      fundName: fundName.get(o.offering_id) ?? null,
      profileLabel: o.investment_profile_id ? (profileLabel.get(o.investment_profile_id) ?? null) : null,
      stage: o.stage ? (STAGE_LABEL[o.stage] ?? o.stage) : null,
      identity: status("identity"),
      eligibility: status("eligibility"),
      tax: status("tax"),
      subscription: status("subscription"),
      funding: status("funding"),
      nextAction: r?.nextAction?.label ?? null,
    };
  });
}

/** Display-only: one row per person when staff grouped several logins as the same person. Accounts stay separate. */
export function collapseSamePersonRows<T extends InvestorListRow>(rows: T[], groupOf: Map<string, string>): (T & { otherAccounts?: string[] })[] {
  const out: (T & { otherAccounts?: string[] })[] = [];
  const base = new Map<string, string | null>();
  const lead = new Map<string, T & { otherAccounts?: string[] }>();
  for (const r of rows) {
    const g = groupOf.get(r.id);
    const first = g ? lead.get(g) : undefined;
    if (!first) { const row = { ...r, funds: [...r.funds], clients: [...r.clients] }; if (g) { lead.set(g, row); base.set(g, r.subtitle); } out.push(row); continue; }
    for (const f of r.funds) if (!first.funds.some((x) => x.fundId === f.fundId)) first.funds.push(f);
    for (const c of r.clients) if (!first.clients.some((x) => x.id === c.id)) first.clients.push(c);
    first.otherAccounts = [...(first.otherAccounts ?? []), r.subtitle ?? r.title];
    first.subtitle = `${base.get(g!) ?? ""} · also ${first.otherAccounts.join(", ")}`.replace(/^ · /, "");
  }
  return out;
}
