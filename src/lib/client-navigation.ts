/**
 * Navigation for the client application (app.harmonious.co).
 *
 * Pure rules with no database, network or browser access. Navigation is derived
 * from the workspace a person is actually in and the relationships the server
 * resolved for them — never from an email address, a hostname or anything the
 * browser chose for itself. Showing or hiding a link is a courtesy; the backend
 * still decides every request.
 */

import { appUrl } from "@/lib/app-origins";
import {
  availableWorkspaces,
  type RelationshipFacts,
  type Workspace,
  type WorkspaceKind,
} from "@/lib/session-resolution";

export type ClientNavLink = {
  title: string;
  /** Internal path within the client application. */
  url: string;
  /** Optional icon name, resolved by the shell. */
  icon?: string;
};

export type ContextualTab = { id: string; title: string; url: string };

/**
 * Sections that belong to Harmonious Operations. A client-facing menu must
 * never contain a link starting with one of these, whoever is signed in.
 */
export const INTERNAL_PATH_PREFIXES = ["/admin", "/ops", "/staff"];

const INVESTOR_NAV: ClientNavLink[] = [
  { title: "Home", url: "/home", icon: "home" },
  { title: "Investments", url: "/dashboard", icon: "briefcase" },
  { title: "Activity", url: "/activity", icon: "history" },
  { title: "Reports", url: "/investor-reporting", icon: "report" },
  { title: "Documents", url: "/documents", icon: "document" },
  { title: "Tax", url: "/tax", icon: "tax" },
  { title: "Profile", url: "/profile", icon: "person" },
];

const FUND_MANAGER_NAV: ClientNavLink[] = [
  { title: "Home", url: "/manager", icon: "home" },
  { title: "Funds", url: "/manager/funds", icon: "building" },
  { title: "Investors", url: "/manager/investors", icon: "people" },
  { title: "Capital", url: "/manager/capital", icon: "money" },
  { title: "Reports", url: "/manager/reporting", icon: "report" },
  { title: "Documents", url: "/manager/documents", icon: "document" },
  { title: "Profile", url: "/profile", icon: "person" },
];

const COMPANY_NAV: ClientNavLink[] = [
  { title: "Home", url: "/client", icon: "home" },
  { title: "Company", url: "/client/services", icon: "building" },
  { title: "Cap table", url: "/client/cap-table/table", icon: "table" },
  { title: "Stakeholders", url: "/client/cap-table/investors", icon: "people" },
  { title: "Transactions", url: "/client/cap-table/securities", icon: "money" },
  { title: "Documents", url: "/client/cap-table/documents", icon: "document" },
  { title: "Reports", url: "/client/cap-table/reports", icon: "report" },
  { title: "Profile", url: "/profile", icon: "person" },
];

const PROFESSIONAL_NAV: ClientNavLink[] = [
  { title: "Home", url: "/professional", icon: "home" },
  { title: "Clients", url: "/professional/profiles", icon: "people" },
  { title: "Tasks", url: "/professional/tasks", icon: "tasks" },
  { title: "Documents", url: "/professional/documents", icon: "document" },
  { title: "Profile", url: "/profile", icon: "person" },
];

/** The primary menu for a workspace. Operations has no client menu at all. */
export function clientNavigation(kind: WorkspaceKind | null): ClientNavLink[] {
  switch (kind) {
    case "investor":
      return INVESTOR_NAV;
    case "fund_manager":
      return FUND_MANAGER_NAV;
    case "company":
      return COMPANY_NAV;
    case "professional":
      return PROFESSIONAL_NAV;
    default:
      return [];
  }
}

/** True when a menu contains anything that belongs to Harmonious Operations. */
export function containsInternalLinks(links: ClientNavLink[]): boolean {
  return links.some((link) =>
    INTERNAL_PATH_PREFIXES.some((prefix) => link.url === prefix || link.url.startsWith(`${prefix}/`)),
  );
}

/** Tabs shown when an investor opens one of their investments. */
export function investmentWorkspaceTabs(investmentId: string): ContextualTab[] {
  const base = `/investment/${investmentId}`;
  return [
    { id: "overview", title: "Overview", url: base },
    { id: "capital", title: "Capital", url: `${base}?tab=capital` },
    { id: "activity", title: "Activity", url: `${base}?tab=activity` },
    { id: "performance", title: "Performance", url: `${base}?tab=performance` },
    { id: "reports", title: "Reports", url: `${base}?tab=reports` },
    { id: "documents", title: "Documents", url: `${base}?tab=documents` },
    { id: "tax", title: "Tax", url: `${base}?tab=tax` },
  ];
}

export type FundCapability =
  | "overview"
  | "investors"
  | "investments"
  | "capital"
  | "reports"
  | "documents";

const FUND_TAB_TITLES: Record<FundCapability, string> = {
  overview: "Overview",
  investors: "Investors",
  investments: "Investments",
  capital: "Capital",
  reports: "Reports",
  documents: "Documents",
};

const FUND_TAB_PATHS: Record<FundCapability, (fundId: string) => string> = {
  overview: (id) => `/manager/fund/${id}`,
  investors: (id) => `/manager/fund/${id}/investors`,
  investments: (id) => `/manager/fund/${id}/assets`,
  capital: (id) => `/manager/fund/${id}/transactions`,
  reports: (id) => `/manager/fund/${id}?tab=reports`,
  documents: (id) => `/manager/fund/${id}/documents`,
};

const FUND_TAB_ORDER: FundCapability[] = [
  "overview",
  "investors",
  "investments",
  "capital",
  "reports",
  "documents",
];

/**
 * Tabs shown when a manager opens a fund. Only capabilities the server has
 * granted appear — and only for a fund this person actually manages.
 */
export function fundWorkspaceTabs(
  fundId: string,
  capabilities: FundCapability[],
): ContextualTab[] {
  return FUND_TAB_ORDER.filter((tab) => capabilities.includes(tab)).map((tab) => ({
    id: tab,
    title: FUND_TAB_TITLES[tab],
    url: FUND_TAB_PATHS[tab](fundId),
  }));
}

/** Whether a manager may open a fund. The server repeats this check. */
export function canOpenFund(managedFundIds: string[], fundId: string): boolean {
  return managedFundIds.includes(fundId);
}

/** Whether an investor may open an investment profile. The server repeats this check. */
export function canOpenInvestmentProfile(
  ownedProfileIds: string[],
  profileId: string,
): boolean {
  return ownedProfileIds.includes(profileId);
}

export type WorkspaceOption = Workspace & {
  /** Where selecting this entry sends the browser. */
  href: string;
  /** True when the entry leaves the client application entirely. */
  external: boolean;
};

/**
 * Entries for the workspace switcher. Harmonious Operations, when present,
 * leaves for the operations application rather than turning the client
 * application into an internal one.
 */
export function workspaceOptions(
  workspaces: Workspace[],
  env?: Record<string, string | undefined>,
): WorkspaceOption[] {
  return workspaces.map((workspace) =>
    workspace.surface === "ops"
      ? { ...workspace, href: appUrl("ops", workspace.path, env), external: true }
      : { ...workspace, href: workspace.path, external: false },
  );
}

/** Convenience for building switcher entries straight from resolved facts. */
export function workspaceOptionsFromFacts(
  facts: RelationshipFacts,
  env?: Record<string, string | undefined>,
): WorkspaceOption[] {
  return workspaceOptions(availableWorkspaces(facts), env);
}

/** The account menu. System administration never appears here. */
export function accountMenu(options: { isProfessional: boolean }): ClientNavLink[] {
  const links: ClientNavLink[] = [
    { title: "My profile", url: "/profile" },
    { title: "Investment profiles", url: "/profile?section=profiles" },
    { title: "Security", url: "/profile?section=security" },
    { title: "Who can see my information", url: "/access" },
  ];
  if (options.isProfessional) {
    links.push({ title: "Professional memberships", url: "/professional/organization" });
  }
  return links;
}

/**
 * Pages that moved into a contextual workspace keep working: old addresses
 * resolve to the new location with their record context intact. Anything not
 * listed stays exactly where it is.
 */
const MOVED_PAGES: Record<string, string> = {
  "/manager/nav": "/manager/reporting?section=nav",
  "/manager/performance-reporting": "/manager/reporting?section=performance",
  "/manager/allocations": "/manager/capital?section=investor-capital",
  "/manager/cash-approvals": "/manager/capital?section=cash-to-confirm",
  "/manager/financials": "/manager/reporting?section=financials",
};

export function legacyClientRedirect(path: string): string | null {
  const [pathname = "", query = ""] = path.split("?");
  const target = MOVED_PAGES[pathname];
  if (!target) return null;
  if (!query) return target;
  const joiner = target.includes("?") ? "&" : "?";
  return `${target}${joiner}${query}`;
}

/** The banner text shown while acting for someone else. */
export function delegationBanner(input: {
  principalName: string;
  organizationName?: string | null | undefined;
}): { acting: string; through: string | null; exitLabel: string; exitUrl: string } {
  return {
    acting: `Acting on behalf of ${input.principalName}`,
    through: input.organizationName ? `Through ${input.organizationName}` : null,
    exitLabel: "Exit delegated access",
    exitUrl: "/professional",
  };
}

/**
 * Delegated context must not follow someone to an unrelated resource. When the
 * resource being opened is not covered by the delegation, the context is
 * dropped rather than quietly carried over.
 */
export function keepDelegatedContext(input: {
  delegatedProfileIds: string[];
  resourceProfileId?: string | null;
}): boolean {
  if (!input.resourceProfileId) return true;
  return input.delegatedProfileIds.includes(input.resourceProfileId);
}

/** Client search only ever looks at what the active workspace can reach. */
export function searchScope(kind: WorkspaceKind | null): string[] {
  switch (kind) {
    case "investor":
      return ["investments", "documents", "reports", "tax_documents"];
    case "fund_manager":
      return ["funds", "investors", "capital", "reports", "documents"];
    case "company":
      return ["company", "cap_table", "stakeholders", "documents", "reports"];
    case "professional":
      return ["clients", "tasks", "documents"];
    default:
      return [];
  }
}

/** Non-sensitive navigation telemetry. Never carries record content. */
export function navigationTelemetry(input: {
  workspaceKind: WorkspaceKind | null;
  path: string;
}): { event: string; workspace: string; section: string } {
  const section = input.path.split("?")[0]?.split("/").filter(Boolean)[0] ?? "home";
  return {
    event: "client_navigation",
    workspace: input.workspaceKind ?? "none",
    section,
  };
}

/**
 * Which menu a page should get. Client pages get the client menu; the internal
 * sections keep the internal menu until the operations console moves to its own
 * address. This is presentation only — the backend still authorizes every
 * request either way.
 */
export function menuForContext(input: {
  pathname: string;
  hasClientWorkspace: boolean;
  activeKind: WorkspaceKind | null;
}): "client" | "internal" {
  const onInternalPage = INTERNAL_PATH_PREFIXES.some(
    (prefix) => input.pathname === prefix || input.pathname.startsWith(`${prefix}/`),
  );
  if (onInternalPage || !input.hasClientWorkspace || input.activeKind === "operations") {
    return "internal";
  }
  return "client";
}

/** What must be forgotten when a person switches workspace or signs out. */
export function contextToClear(): string[] {
  return ["query-cache", "harmonious.workspace.active", "delegated-context"];
}

/**
 * Remembered things that say nothing about a record or a relationship — only
 * how the screen was arranged last time. These survive a workspace switch.
 */
export const COSMETIC_STORAGE_KEYS = ["harmonious.sidebar.openGroups"];

/**
 * Which remembered browser entries must go when a person switches workspace or
 * signs out: everything the application stored except purely cosmetic layout
 * state. The backend re-checks authority regardless; this keeps a record chosen
 * in one workspace from being shown while the next one loads.
 */
export function storageKeysToClear(existing: string[]): string[] {
  return existing.filter(
    (key) => key.startsWith("harmonious.") && !COSMETIC_STORAGE_KEYS.includes(key),
  );
}
