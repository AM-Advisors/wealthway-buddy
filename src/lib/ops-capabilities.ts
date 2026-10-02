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
/** A step in the area's process. Screens without `cap` use the area's own capability. */
export type OpsStep = "Start" | "Prepare" | "Review" | "Approve" | "Track" | "Reference";
export type OpsScreen = { title: string; url: string; description: string; cap?: OpsArea; step?: OpsStep };
export type OpsWorkArea = OpsSection & {
  group: OpsSectionGroup;
  /** Screens in process order, reached from the area page and search. */
  screens: OpsScreen[];
  /** Extra path prefixes that belong to this area (e.g. singular /ops/fund). */
  match?: string[];
  /** Work-queue areas whose waiting items show on this area's page. */
  queues?: OpsArea[];
};

/**
 * The Operations work areas, one per team process. A merged area keeps each
 * screen's original capability (`cap`), so nobody gains or loses access;
 * every old address keeps working because nothing here removes a route.
 */
export const OPS_WORK_AREAS: OpsWorkArea[] = [
  {
    id: "clients", title: "Clients", url: "/ops/clients", icon: "briefcase", group: "records", queues: ["clients", "tasks"],
    screens: [
      { title: "My clients", url: "/staff", description: "Clients assigned to you", cap: "tasks", step: "Start" },
      { title: "Client onboarding", url: "/admin/onboarding", description: "Set up a new client", cap: "onboarding", step: "Start" },
      { title: "Entities and engagements", url: "/admin/entities", description: "Client entities and engagements", step: "Prepare" },
      { title: "Agreements & SOW", url: "/admin/agreements", description: "Master agreements and statements of work", step: "Prepare" },
      { title: "Service requests & sign-off", url: "/admin/signoff", description: "Requests and documents waiting for sign-off", cap: "tasks", step: "Approve" },
      { title: "Contacts, deals & campaigns", url: "/sales/crm", description: "Sales contacts, client pipeline and approved email campaigns", step: "Start" },
      { title: "Messages", url: "/ops/messages", description: "Questions from fund managers and investors", cap: "tasks", step: "Track" },
      { title: "Sales & pricing approvals", url: "/sales", description: "Fund pricing, below-baseline approvals and commercial follow-up", step: "Approve" },
      { title: "Rate card", url: "/admin/pricing", description: "Standard pricing schedules", step: "Reference" },
      { title: "Rate proposals", url: "/admin/rate-proposals", description: "Proposed changes to the rate card", step: "Review" },
      { title: "Unpaid invoices", url: "/admin/invoices", description: "Client invoices awaiting payment", step: "Track" },
      { title: "Incoming requests", url: "/admin/requests", description: "Requests from clients", cap: "tasks", step: "Track" },
      { title: "Clients and scope", url: "/admin/contracts", description: "Contract terms and engagement scope", step: "Reference" },
      { title: "Services catalogue", url: "/admin/services", description: "Service catalogue and delivery", step: "Reference" },
      { title: "Bank setup packets", url: "/admin/bank-packets", description: "Partner bank paperwork clients receive", step: "Reference" },
      { title: "Contract permissions", url: "/ops/contracts/permissions", description: "Who may upload, review, approve and price contracts", step: "Reference" },
      { title: "Client portal activity", url: "/admin/client-activity", description: "What clients did in the portal", step: "Reference" },
    ],
  },
  {
    id: "funds", title: "Funds & SPVs", url: "/ops/funds", icon: "building", group: "records", match: ["/ops/fund"], queues: ["funds", "regulatory", "documents"],
    screens: [
      { title: "Fund Setup", url: "/ops/fund-setup", description: "Details, entity & EIN, Form D, banking, documents and launch", step: "Start" },
      { title: "EIN and SS-4 queue", url: "/ops/ss4", description: "EIN applications across all Funds", cap: "regulatory", step: "Prepare" },
      { title: "Offering statement", url: "/admin/offering-statement", description: "Offering statement drafting", cap: "regulatory", step: "Prepare" },
      { title: "Formation reference data", url: "/ops/formation-reference", description: "Formation providers, state fees and formation packages", step: "Reference" },
      { title: "Document templates", url: "/ops/document-templates", description: "Reusable fund documents with versioning and approval", step: "Review" },
      { title: "Documents & signatures", url: "/ops/documents", description: "Document repository and signature status", cap: "documents", step: "Track" },
      { title: "Document activity", url: "/admin/document-log", description: "Who opened or signed what", cap: "documents", step: "Reference" },
      { title: "Fund access", url: "/admin/access", description: "Who can open each fund", step: "Reference" },
      { title: "Public fund pages", url: "/admin/funds", description: "Public fund pages", step: "Reference" },
    ],
  },
  {
    id: "investors", title: "Investors", url: "/ops/investors", icon: "people", group: "records", queues: ["investors", "onboarding"],
    screens: [
      { title: "Investment readiness queue", url: "/ops/readiness", description: "What each investment is waiting on, who owns it, and how long", cap: "onboarding", step: "Start" },
      { title: "Investor onboarding", url: "/admin/investor-onboarding", description: "Investments in progress, KYC/KYB and accreditation", cap: "onboarding", step: "Review" },
      { title: "Applications", url: "/admin", description: "Fund applications waiting for review", cap: "onboarding", step: "Review" },
      { title: "New application", url: "/admin/new-application", description: "Start an application for an investor", cap: "onboarding", step: "Prepare" },
      { title: "Investor directory", url: "/admin/investors", description: "All investors across funds", step: "Reference" },
      { title: "Onboarding progress", url: "/admin/onboarding-progress", description: "Progress across open onboardings", cap: "onboarding", step: "Track" },
      { title: "Onboarding funnel", url: "/admin/funnel", description: "Conversion through onboarding", cap: "onboarding", step: "Track" },
    ],
  },
  {
    id: "capital", title: "Money", url: "/ops/areas/capital", icon: "money", group: "work", queues: ["capital"],
    screens: [
      { title: "Expected funding", url: "/admin/funding", description: "Capital calls, expected funding and exceptions", step: "Track" },
      { title: "Banking requests", url: "/ops/banking", description: "New and changed fund bank accounts", step: "Review" },
      { title: "Distribution review", url: "/ops/distributions", description: "Review distributions and payment controls", step: "Review" },
      { title: "Distribution batches & payments", url: "/admin/distributions", description: "Approved batches and their payments", step: "Approve" },
      { title: "Wire activity", url: "/admin/money", description: "Incoming and outgoing wire records", step: "Track" },
      { title: "Wire instructions", url: "/admin/wire", description: "Protected wire instructions", step: "Reference" },
      { title: "Fund bank accounts", url: "/admin/bank-accounts", description: "Fund bank accounts", step: "Reference" },
      { title: "Client bank accounts", url: "/admin/client-bank-accounts", description: "Client bank accounts", step: "Reference" },
    ],
  },
  {
    id: "accounting", title: "Accounting & Reports", url: "/ops/areas/accounting", icon: "ledger", group: "work", queues: ["accounting", "reports"],
    screens: [
      { title: "Accounting close", url: "/ops/accounting", description: "Reconciliation, journals and period close", step: "Prepare" },
      { title: "Valuation review", url: "/ops/valuations", description: "Review proposed valuations", step: "Review" },
      { title: "NAV review", url: "/ops/nav", description: "Review NAV calculations", step: "Review" },
      { title: "Investor allocations", url: "/ops/allocations", description: "Allocation runs to capital accounts", step: "Approve" },
      { title: "Financial statements", url: "/ops/financial-reviews", description: "Prepare, review and approve quarterly and annual packages", cap: "reports", step: "Prepare" },
      { title: "Capital statements & review memos", url: "/ops/statements", description: "Approve capital account statements and client review memos", cap: "reports", step: "Approve" },
      { title: "Investor reporting", url: "/ops/reporting", description: "Investor report packages", cap: "reports", step: "Track" },
      { title: "Fund financial records", url: "/ops/financials", description: "Posted fund financial statements", cap: "reports", step: "Reference" },
      { title: "Performance reporting", url: "/ops/performance", description: "Performance metrics", cap: "reports", step: "Reference" },
    ],
  },
  {
    id: "tax", title: "Tax", url: "/ops/tax", icon: "tax", group: "work", queues: ["tax"],
    screens: [
      { title: "Tax workspace", url: "/ops/tax", description: "Prepared returns, 1065s, 1042-Ss and 1099s - prepare and review", step: "Prepare" },
      { title: "K-1s and investor tax documents", url: "/ops/tax-documents", description: "K-1s and tax documents for investors", step: "Review" },
      { title: "Investor tax forms (W-9 / W-8)", url: "/ops/tax-review", description: "IRS form status, compliance policy and legal wording", step: "Review" },
    ],
  },
  {
    id: "companies", title: "Companies", url: "/ops/companies", icon: "table", group: "records", queues: ["companies"],
    screens: [
      { title: "Cap table requests", url: "/admin/cap-table-requests", description: "Requests from companies", step: "Start" },
      { title: "Migration concierge", url: "/admin/cap-table-migrations", description: "Imports from other systems", step: "Prepare" },
      { title: "Client cap tables", url: "/admin/client-cap-tables", description: "Company ownership records", step: "Reference" },
      { title: "Cap table plans", url: "/admin/cap-table-plans", description: "Plans and subscriptions", step: "Reference" },
    ],
  },
  {
    id: "administration", title: "Administration", url: "/ops/areas/administration", icon: "settings", group: "admin", queues: ["administration"],
    screens: [
      { title: "Add user", url: "/admin/add-user", description: "Invite a Harmonious team member and assign permissions", step: "Start" },
      { title: "Access Control", url: "/ops/access-control", description: "People, roles, permissions and access audit", step: "Start" },
      { title: "Compliance & Controls", url: "/ops/compliance", description: "Controls, evidence, access reviews, privacy, vendors, risks, incidents", step: "Review" },
      { title: "Operations team", url: "/ops/team", description: "Staff and their roles", step: "Reference" },
      { title: "Legacy permission settings", url: "/admin/permissions", description: "Older permission configuration (use Access Control for new changes)", step: "Reference" },
      { title: "Audit log", url: "/admin/audit", description: "Immutable audit history", step: "Reference" },
      { title: "Activity log", url: "/admin/activity", description: "Everything that happened", cap: "tasks", step: "Reference" },
      { title: "Timeline", url: "/admin/timeline", description: "Operational timeline", cap: "tasks", step: "Reference" },
      { title: "Security", url: "/admin/security", description: "Security settings", step: "Reference" },
      { title: "Email preview", url: "/admin/email-preview", description: "Preview outgoing emails", step: "Reference" },
      { title: "Email delivery", url: "/ops/email-health", description: "Bounced and failed platform emails", step: "Track" },
      { title: "Webhook log", url: "/ops/webhook-log", description: "Identity check, Box Sign and Plaid updates", step: "Track" },
      { title: "System status", url: "/ops/system-status", description: "App and backend health", step: "Track" },
    ],
  },
];

/** Retired area pages and where their work now lives. */
export const RETIRED_AREA_REDIRECTS: Record<string, string> = {
  onboarding: "investors",
  regulatory: "funds",
  documents: "funds",
  tasks: "clients",
  reports: "accounting",
};

const screenCap = (area: OpsWorkArea, s: OpsScreen): OpsArea => s.cap ?? area.id;

/** Screens in this area the person may open (capability per screen). */
export function allowedScreens(area: OpsWorkArea, capabilities: readonly OpsCapability[]): OpsScreen[] {
  return area.screens.filter((s) => can(capabilities, screenCap(area, s), "see"));
}

/** An area shows when its own capability, or any of its screens' capabilities, is held. */
export function areaVisible(area: OpsWorkArea, capabilities: readonly OpsCapability[]): boolean {
  return can(capabilities, area.id, "see") || allowedScreens(area, capabilities).length > 0;
}

/** Menu link: the area's main page when allowed, otherwise its work page. */
function sectionFor(area: OpsWorkArea, capabilities: readonly OpsCapability[]): OpsSection {
  const url = can(capabilities, area.id, "see") ? area.url : `/ops/areas/${area.id}`;
  return { id: area.id, title: area.title, url, icon: area.icon };
}

/** Home is always first for anyone who may enter at all. */
export const OPS_HOME = { id: "home", title: "Home", url: "/ops", icon: "home" } as const;

export function opsNavigation(capabilities: readonly OpsCapability[]): OpsSection[] {
  return OPS_WORK_AREAS.filter((a) => areaVisible(a, capabilities)).map((a) => sectionFor(a, capabilities));
}

/** Work areas (with their screens) this person may see. */
export function opsWorkAreas(capabilities: readonly OpsCapability[]): OpsWorkArea[] {
  return OPS_WORK_AREAS.filter((area) => areaVisible(area, capabilities)).map((area) => ({ ...area, screens: allowedScreens(area, capabilities) }));
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
  const retired = pathname.match(/^\/ops\/areas\/([a-z]+)$/)?.[1];
  if (retired && RETIRED_AREA_REDIRECTS[retired]) return RETIRED_AREA_REDIRECTS[retired]!;
  let best: { id: string; len: number } | null = null;
  for (const area of OPS_WORK_AREAS) {
    const paths = [area.url, `/ops/areas/${area.id}`, ...area.screens.map((s) => s.url), ...(area.match ?? [])];
    for (const p of paths) {
      const hit = p === "/admin" ? pathname === "/admin" : under(pathname, p);
      if (hit && (!best || p.length > best.len)) best = { id: area.id, len: p.length };
    }
  }
  return best?.id ?? null;
}

/** Operations pages must never appear in a client menu, and the reverse. */
export const OPS_PATH_PREFIXES = ["/ops", "/admin", "/staff"];

/** Screens gated by a server-checked flag beyond area access (UX only; the server re-checks). */
export const GATED_SCREENS: Record<string, "accessControl"> = { "/ops/access-control": "accessControl", "/ops/compliance": "accessControl" };
export function visibleScreens<T extends { url: string }>(screens: readonly T[], flags: { accessControl: boolean }): T[] {
  return screens.filter((s) => !GATED_SCREENS[s.url] || flags[GATED_SCREENS[s.url]!]);
}
