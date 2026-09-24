/**
 * What a member of the Harmonious team may do inside Operations.
 *
 * Two rules hold everywhere in this file:
 *  - being signed in grants nothing; only an active staff assignment does;
 *  - a menu entry is never permission. The backend checks the same capability
 *    again on every request, and nobody approves their own preparation.
 */

export const OPS_AREAS = [
  "clients",
  "funds",
  "companies",
  "investors",
  "onboarding",
  "capital",
  "accounting",
  "tax",
  "regulatory",
  "documents",
  "tasks",
  "reports",
  "administration",
] as const;

export type OpsArea = (typeof OPS_AREAS)[number];

export const OPS_ACTIONS = ["see", "prepare", "review", "approve", "execute"] as const;
export type OpsAction = (typeof OPS_ACTIONS)[number];

export type OpsCapability = `${OpsArea}:${OpsAction}`;

/** Every Harmonious role that can open Operations at all. */
export const OPS_STAFF_ROLES = [
  "admin",
  "super_admin",
  "operations",
  "legal",
  "compliance",
  "fund_administration",
  "tax",
  "finance",
  "client_success",
  "executive",
] as const;

const caps = (areas: readonly OpsArea[], actions: readonly OpsAction[]): OpsCapability[] =>
  areas.flatMap((area) => actions.map((action) => `${area}:${action}` as OpsCapability));

const ALL_AREAS = OPS_AREAS;
const SEE_ONLY = ["see"] as const;
const THROUGH_APPROVE = ["see", "prepare", "review", "approve"] as const;
const THROUGH_REVIEW = ["see", "prepare", "review"] as const;
const SEE_PREPARE = ["see", "prepare"] as const;

/**
 * Role to capability. Deliberately narrow: money is executed by finance,
 * configuration is changed by administrators, and everyone else stops at the
 * step their job actually covers.
 */
const ROLE_GRANTS: Record<string, OpsCapability[]> = {
  super_admin: caps(ALL_AREAS, OPS_ACTIONS),
  admin: [...caps(ALL_AREAS, THROUGH_APPROVE), "administration:execute"],
  operations: [
    ...caps(
      ["clients", "funds", "companies", "investors", "capital", "documents", "tasks", "reports"],
      SEE_PREPARE,
    ),
    ...caps(["onboarding"], THROUGH_REVIEW),
  ],
  fund_administration: caps(
    ["funds", "investors", "capital", "accounting", "reports"],
    THROUGH_REVIEW,
  ),
  finance: [...caps(["capital", "accounting"], THROUGH_APPROVE), "capital:execute"],
  tax: caps(["tax", "reports"], THROUGH_APPROVE),
  legal: caps(["clients", "regulatory", "documents"], THROUGH_APPROVE),
  compliance: [
    ...caps(["onboarding", "investors", "regulatory"], ["see", "review", "approve"]),
    "documents:see",
  ],
  client_success: [
    ...caps(["clients", "investors", "documents", "tasks"], SEE_ONLY),
    ...caps(["onboarding"], SEE_PREPARE),
  ],
  executive: caps(ALL_AREAS, SEE_ONLY),
};

/** Whether this person may open Operations at all. */
export function hasOperationsEntry(roles: readonly string[]): boolean {
  return roles.some((role) => (OPS_STAFF_ROLES as readonly string[]).includes(role));
}

/** The capabilities these roles add up to. An unknown role contributes nothing. */
export function capabilitiesFor(roles: readonly string[]): OpsCapability[] {
  const out = new Set<OpsCapability>();
  for (const role of roles) for (const cap of ROLE_GRANTS[role] ?? []) out.add(cap);
  return [...out].sort();
}

export function can(
  capabilities: readonly OpsCapability[],
  area: OpsArea,
  action: OpsAction,
): boolean {
  return capabilities.includes(`${area}:${action}` as OpsCapability);
}

/**
 * Approving is refused when the same person prepared the item, whatever their
 * role says. This mirrors the separation already enforced for money movement.
 */
export function canApprove(input: {
  capabilities: readonly OpsCapability[];
  area: OpsArea;
  actorUserId: string;
  preparedByUserId?: string | null;
}): boolean {
  if (!can(input.capabilities, input.area, "approve")) return false;
  return input.preparedByUserId !== input.actorUserId;
}

export type OpsSection = { id: OpsArea; title: string; url: string; icon: string };
export type OpsSectionGroup = "records" | "work" | "admin";
export type OpsScreen = { title: string; url: string; description: string };
export type OpsWorkArea = OpsSection & {
  group: OpsSectionGroup;
  /** Specialist screens reached from the area landing page and search. */
  screens: OpsScreen[];
  /** Extra path prefixes that belong to this area (e.g. singular /ops/fund). */
  match?: string[];
};

/**
 * The Operations work areas, in the order the work happens. Specialist
 * screens live underneath their area instead of in the sidebar; every old
 * address keeps working because nothing here removes a route.
 */
export const OPS_WORK_AREAS: OpsWorkArea[] = [
  {
    id: "clients", title: "Clients", url: "/ops/clients", icon: "briefcase", group: "records",
    screens: [
      { title: "Clients and scope", url: "/admin/contracts", description: "Contracts and engagement scope" },
      { title: "Entities and engagements", url: "/admin/entities", description: "Client entities and engagements" },
      { title: "Services administration", url: "/admin/services", description: "Service catalogue and delivery" },
      { title: "Agreements & SOW", url: "/admin/agreements", description: "Master agreements and statements of work" },
      { title: "Pricing and agreements", url: "/admin/pricing", description: "Pricing schedules" },
      { title: "Rate proposals", url: "/admin/rate-proposals", description: "Proposed fee changes" },
      { title: "Contract permissions", url: "/ops/contracts/permissions", description: "Who may upload, review, approve and price contracts" },
      { title: "Unpaid invoices", url: "/admin/invoices", description: "Client invoices awaiting payment" },
      { title: "Client portal activity", url: "/admin/client-activity", description: "What clients did in the portal" },
    ],
  },
  {
    id: "funds", title: "Funds & SPVs", url: "/ops/funds", icon: "building", group: "records", match: ["/ops/fund"],
    screens: [
      { title: "Fund setup", url: "/admin/setup", description: "Configure a new fund or SPV" },
      { title: "Fund pages", url: "/admin/funds", description: "Public fund pages" },
      { title: "Fund access", url: "/admin/access", description: "Who can open each fund" },
    ],
  },
  {
    id: "companies", title: "Companies", url: "/ops/companies", icon: "table", group: "records",
    screens: [
      { title: "Client cap tables", url: "/admin/client-cap-tables", description: "Company ownership records" },
      { title: "Cap table requests", url: "/admin/cap-table-requests", description: "Requests from companies" },
      { title: "Cap table plans", url: "/admin/cap-table-plans", description: "Plans and subscriptions" },
      { title: "Migration concierge", url: "/admin/cap-table-migrations", description: "Imports from other systems" },
    ],
  },
  {
    id: "investors", title: "Investors", url: "/ops/investors", icon: "people", group: "records",
    screens: [{ title: "Investor directory", url: "/admin/investors", description: "All investors across funds" }],
  },
  {
    id: "onboarding", title: "Onboarding & Checks", url: "/ops/areas/onboarding", icon: "check", group: "work",
    screens: [
      { title: "Investor onboarding", url: "/admin/investor-onboarding", description: "Investments in progress, KYC/KYB and accreditation" },
      { title: "Client onboarding", url: "/admin/onboarding", description: "New client setup" },
      { title: "Onboarding progress", url: "/admin/onboarding-progress", description: "Progress across open onboardings" },
      { title: "Applications", url: "/admin", description: "Fund applications queue" },
      { title: "New application", url: "/admin/new-application", description: "Start an application" },
      { title: "Onboarding funnel", url: "/admin/funnel", description: "Conversion through onboarding" },
    ],
  },
  {
    id: "capital", title: "Capital & Banking", url: "/ops/areas/capital", icon: "money", group: "work",
    screens: [
      { title: "Banking requests", url: "/ops/banking", description: "Bank account requests" },
      { title: "Distributions", url: "/ops/distributions", description: "Distribution review and payment controls" },
      { title: "Expected funding", url: "/admin/funding", description: "Capital calls, expected funding and exceptions" },
      { title: "Distributions & payments", url: "/admin/distributions", description: "Distribution batches and payments" },
      { title: "Wires and distributions", url: "/admin/money", description: "Wire activity" },
      { title: "Wire instructions", url: "/admin/wire", description: "Protected wire instructions" },
      { title: "Bank accounts", url: "/admin/bank-accounts", description: "Fund bank accounts" },
      { title: "Client bank accounts", url: "/admin/client-bank-accounts", description: "Client bank accounts" },
    ],
  },
  {
    id: "accounting", title: "Accounting", url: "/ops/areas/accounting", icon: "ledger", group: "work",
    screens: [
      { title: "Accounting operations", url: "/ops/accounting", description: "Reconciliation, journals and period close" },
      { title: "Valuation review", url: "/ops/valuations", description: "Review proposed valuations" },
      { title: "NAV review", url: "/ops/nav", description: "Review NAV calculations" },
      { title: "Investor allocations", url: "/ops/allocations", description: "Allocation runs to capital accounts" },
    ],
  },
  {
    id: "tax", title: "Tax", url: "/ops/tax-documents", icon: "tax", group: "work",
    screens: [
      { title: "Tax documents", url: "/ops/tax-documents", description: "K-1s and investor tax documents" },
      { title: "Investor tax review", url: "/ops/tax-review", description: "IRS form status, compliance policy and legal wording" },
    ],
  },
  {
    id: "regulatory", title: "Regulatory & Filings", url: "/ops/ss4", icon: "shield", group: "work",
    screens: [
      { title: "EIN and SS-4", url: "/ops/ss4", description: "EIN applications and SS-4 preparation" },
      { title: "Offering statement", url: "/admin/offering-statement", description: "Offering statement drafting" },
    ],
  },
  {
    id: "documents", title: "Documents", url: "/ops/areas/documents", icon: "document", group: "work",
    screens: [
      { title: "Documents", url: "/ops/documents", description: "Document repository and signatures" },
      { title: "Document activity", url: "/admin/document-log", description: "Who opened or signed what" },
    ],
  },
  {
    id: "tasks", title: "Tasks & Activity", url: "/ops/areas/tasks", icon: "tasks", group: "work",
    screens: [
      { title: "My clients", url: "/staff", description: "Clients assigned to you" },
      { title: "Service requests & sign-off", url: "/admin/signoff", description: "Requests waiting for sign-off" },
      { title: "Requests", url: "/admin/requests", description: "Incoming requests" },
      { title: "Timeline", url: "/admin/timeline", description: "Operational timeline" },
      { title: "Activity log", url: "/admin/activity", description: "Everything that happened" },
    ],
  },
  {
    id: "reports", title: "Reports", url: "/ops/areas/reports", icon: "report", group: "work",
    screens: [
      { title: "Financial reporting", url: "/ops/financials", description: "Fund financial statements" },
      { title: "Performance reporting", url: "/ops/performance", description: "Performance metrics" },
      { title: "Investor reporting", url: "/ops/reporting", description: "Investor report packages" },
    ],
  },
  {
    id: "administration", title: "Administration", url: "/ops/areas/administration", icon: "settings", group: "admin",
    screens: [
      { title: "Operations team", url: "/ops/team", description: "Staff and their roles" },
      { title: "Permissions", url: "/admin/permissions", description: "Permission configuration" },
      { title: "Audit log", url: "/admin/audit", description: "Immutable audit history" },
      { title: "Security", url: "/admin/security", description: "Security settings" },
      { title: "Email preview", url: "/admin/email-preview", description: "Preview outgoing emails" },
    ],
  },
];

const SECTIONS: OpsSection[] = OPS_WORK_AREAS.map(({ id, title, url, icon }) => ({ id, title, url, icon }));

/** Home is always first for anyone who may enter at all. */
export const OPS_HOME = { id: "home", title: "Home", url: "/ops", icon: "home" } as const;

export function opsNavigation(capabilities: readonly OpsCapability[]): OpsSection[] {
  return SECTIONS.filter((section) => can(capabilities, section.id, "see"));
}

/** Work areas (with their screens) this person may see. */
export function opsWorkAreas(capabilities: readonly OpsCapability[]): OpsWorkArea[] {
  return OPS_WORK_AREAS.filter((area) => can(capabilities, area.id, "see"));
}

export function opsWorkArea(id: string): OpsWorkArea | undefined {
  return OPS_WORK_AREAS.find((area) => area.id === id);
}

const under = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

/**
 * The single primary section that owns a path: the longest matching prefix
 * across area landing pages, their screens and extra prefixes. "/ops" and
 * "/admin" only match exactly so they never swallow child routes.
 */
export function activeOpsSection(pathname: string): string | null {
  if (pathname === "/ops") return "home";
  let best: { id: string; len: number } | null = null;
  for (const area of OPS_WORK_AREAS) {
    const paths = [area.url, ...area.screens.map((s) => s.url), ...(area.match ?? [])];
    for (const p of paths) {
      const hit = p === "/admin" ? pathname === "/admin" : under(pathname, p);
      if (hit && (!best || p.length > best.len)) best = { id: area.id, len: p.length };
    }
  }
  return best?.id ?? null;
}

/** Operations pages must never appear in a client menu, and the reverse. */
export const OPS_PATH_PREFIXES = ["/ops", "/admin", "/staff"];
