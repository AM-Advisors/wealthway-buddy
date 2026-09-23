/**
 * The single, canonical navigation generator.
 *
 *   gatherFacts -> session-resolution -> resolveSession projection -> getNavigation
 *
 * Pure: no database, network or browser access, and no relationship queries.
 * Every menu in both applications (client menu, legacy internal menu,
 * Operations menu, account menu, workspace switcher) is a projection of the
 * session the server resolved. Showing a link is a courtesy; the backend
 * authorizes every request regardless.
 */
import {
  accountMenu,
  clientNavigation,
  INTERNAL_PATH_PREFIXES,
  type ClientNavLink,
} from "@/lib/client-navigation";
import { OPS_HOME, activeOpsSection, opsNavigation, type OpsCapability } from "@/lib/ops-capabilities";
import type { WorkspaceKind } from "@/lib/session-resolution";

export type NavBadgeKey = "signOff" | "applications" | "unpaidInvoices" | "serviceRequests" | "myClients";
export type LegacyNavItem = { title: string; url: string; icon: string; badge?: NavBadgeKey };
export type LegacyNavGroup = { id: string; label: string; items: LegacyNavItem[] };

/** The session fields navigation may read — all produced by resolveSession. */
export type NavigationSession = {
  operations: boolean;
  operationsCapabilities?: readonly OpsCapability[];
  workspaces: { kind: WorkspaceKind; id: string; label: string; path: string; surface: "client" | "ops" }[];
  navigation?: {
    isAdmin: boolean;
    isReviewer: boolean;
    legacyOperationsAllowed: boolean;
    isProfessional: boolean;
  };
};

export const investorItems: LegacyNavItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: "LayoutDashboard" },
  { title: "Documents", url: "/documents", icon: "FileText" },
  { title: "Capital statements", url: "/statements", icon: "FileSpreadsheet" },
  { title: "Fund reports", url: "/investor-financials", icon: "FileSpreadsheet" },
  { title: "Performance", url: "/investor-performance", icon: "Gauge" },
  { title: "Reports", url: "/investor-reporting", icon: "FileSpreadsheet" },
  { title: "My distributions", url: "/investor-distributions", icon: "Banknote" },
  { title: "Fund documents", url: "/fund-documents", icon: "FolderLock" },
  { title: "Document vault", url: "/vault", icon: "FileSignature" },
  { title: "Wire instructions", url: "/wire", icon: "Landmark" },
  { title: "Confirm your wire", url: "/wire-confirmation", icon: "Send" },
  { title: "Due diligence", url: "/diligence", icon: "FolderLock" },
  { title: "Portal", url: "/portal", icon: "Building2" },
  { title: "My equity", url: "/my-equity", icon: "Briefcase" },
  { title: "Items prepared for me", url: "/prepared", icon: "ClipboardList" },
  { title: "Who can see my information", url: "/access", icon: "BookLock" },
  { title: "Signing authority", url: "/signatory", icon: "FileSignature" },

];

export const professionalItems: LegacyNavItem[] = [
  { title: "My clients", url: "/professional", icon: "Users" },
  { title: "Prepare for a client", url: "/professional/prepare", icon: "ClipboardList" },
  { title: "Client profiles", url: "/professional/profiles", icon: "Briefcase" },

  { title: "Funds", url: "/professional/funds", icon: "Building2" },
  { title: "Investments", url: "/professional/investments", icon: "Layers" },
  { title: "Documents", url: "/professional/documents", icon: "FileText" },
  { title: "Tax", url: "/professional/tax", icon: "FileSpreadsheet" },
  { title: "Tasks", url: "/professional/tasks", icon: "ClipboardList" },
  { title: "Activity", url: "/professional/activity", icon: "History" },
  { title: "Organization", url: "/professional/organization", icon: "Handshake" },
  { title: "Firm verification", url: "/professional/verification", icon: "ShieldCheck" },
  { title: "My credentials", url: "/professional/credentials", icon: "BadgeCheck" },
  { title: "Awaiting acceptance", url: "/professional/acceptance", icon: "Handshake" },
  { title: "Authority documents", url: "/professional/authority", icon: "BookLock" },
  { title: "Signatures", url: "/professional/signatures", icon: "FileSignature" },
];

export const managerItems: LegacyNavItem[] = [
  { title: "My funds", url: "/manager", icon: "Briefcase" },
  { title: "Document inbox", url: "/manager/inbox", icon: "Mail" },
  { title: "Joining investors", url: "/manager/investor-onboarding", icon: "Users" },
  { title: "Investor approvals", url: "/manager/approvals", icon: "BadgeCheck" },
  { title: "Cash to confirm", url: "/manager/cash-approvals", icon: "Banknote" },
  { title: "Fund valuations", url: "/manager/valuations", icon: "Gauge" },
  { title: "Fund NAV", url: "/manager/nav", icon: "Gauge" },
  { title: "Investor capital", url: "/manager/allocations", icon: "Users" },
  { title: "Fund financials", url: "/manager/financials", icon: "FileSpreadsheet" },
  { title: "Published performance", url: "/manager/performance-reporting", icon: "Gauge" },
  { title: "Investor packages", url: "/manager/reporting", icon: "FileSpreadsheet" },
  { title: "Fund distributions", url: "/manager/distributions", icon: "Banknote" },
  { title: "Reviewer activity", url: "/manager/activity", icon: "ClipboardList" },
];

export const selectedFundItems = (fundId: string): LegacyNavItem[] => [
  { title: "Overview", url: `/manager/fund/${fundId}`, icon: "Building2" },
  { title: "Investors", url: `/manager/fund/${fundId}/investors`, icon: "Users" },
  { title: "Assets & performance", url: `/manager/fund/${fundId}/assets`, icon: "Gauge" },
  { title: "Transactions", url: `/manager/fund/${fundId}/transactions`, icon: "Banknote" },
  { title: "Documents", url: `/manager/fund/${fundId}/documents`, icon: "FileText" },
  { title: "Compliance", url: `/manager/fund/${fundId}/compliance`, icon: "ShieldCheck" },
  { title: "Settings", url: `/manager/fund/${fundId}/settings`, icon: "ScrollText" },
];

export const operationsItems: LegacyNavItem[] = [
  { title: "Operations", url: "/ops", icon: "ShieldCheck" },
  { title: "Accounting operations", url: "/ops/accounting", icon: "ClipboardList" },
  { title: "Valuation review", url: "/ops/valuations", icon: "Gauge" },
  { title: "NAV review", url: "/ops/nav", icon: "Gauge" },
  { title: "Investor allocations", url: "/ops/allocations", icon: "Users" },
  { title: "Financial reporting", url: "/ops/financials", icon: "FileSpreadsheet" },
  { title: "Performance reporting", url: "/ops/performance", icon: "Gauge" },
  { title: "Investor reporting", url: "/ops/reporting", icon: "FileSpreadsheet" },
  { title: "Banking requests", url: "/ops/banking", icon: "Landmark" },
  { title: "EIN and SS-4", url: "/ops/ss4", icon: "FileText" },
  { title: "Tax documents", url: "/ops/tax-documents", icon: "FileSpreadsheet" },
  { title: "Operations team", url: "/ops/team", icon: "Users" },
];

export const clientsAndMoneyItems: LegacyNavItem[] = [
  { title: "Client onboarding", url: "/admin/onboarding", icon: "UserPlus" },
  { title: "Onboarding progress", url: "/admin/onboarding-progress", icon: "Gauge" },
  { title: "Investor onboarding", url: "/admin/investor-onboarding", icon: "Users" },
  { title: "Distributions & payments", url: "/admin/distributions", icon: "Banknote" },
  { title: "Clients and scope", url: "/admin/contracts", icon: "Handshake" },
  { title: "Entities and engagements", url: "/admin/entities", icon: "Building2" },
  { title: "Services administration", url: "/admin/services", icon: "Layers" },
  { title: "Agreements & SOW", url: "/admin/agreements", icon: "ScrollText" },
  { title: "Pricing and agreements", url: "/admin/pricing", icon: "ScrollText" },
  { title: "Rate proposals", url: "/admin/rate-proposals", icon: "Handshake" },
  {
    title: "Unpaid invoices",
    url: "/admin/invoices",
    icon: "Receipt",
    badge: "unpaidInvoices",
  },
  { title: "Wires and distributions", url: "/admin/money", icon: "Banknote" },
  { title: "Wire instructions", url: "/admin/wire", icon: "Landmark" },
  { title: "Bank accounts", url: "/admin/bank-accounts", icon: "Landmark" },
  { title: "Client bank accounts", url: "/admin/client-bank-accounts", icon: "Landmark" },

];

/** Cap table for founders — their own company ownership records. */
export const capTableFounderItems: LegacyNavItem[] = [
  { title: "Overview", url: "/client/cap-table", icon: "Gauge" },
  { title: "Cap table", url: "/client/cap-table/table", icon: "FileSpreadsheet" },
  { title: "Securities", url: "/client/cap-table/securities", icon: "ScrollText" },
  { title: "Employees", url: "/client/cap-table/employees", icon: "Users" },
  { title: "Investors", url: "/client/cap-table/investors", icon: "Briefcase" },
  { title: "Fundraising", url: "/client/cap-table/fundraising", icon: "Handshake" },
  { title: "Secondaries", url: "/client/cap-table/secondaries", icon: "Banknote" },
  { title: "Exposure and claims", url: "/client/cap-table/exposure", icon: "ShieldCheck" },
  { title: "Migration", url: "/client/cap-table/migration", icon: "History" },
  { title: "Reconciliation", url: "/client/cap-table/reconciliation", icon: "ClipboardList" },
  { title: "Documents", url: "/client/cap-table/documents", icon: "FileText" },
  { title: "Compliance", url: "/client/cap-table/compliance", icon: "BookLock" },
  { title: "Reports", url: "/client/cap-table/reports", icon: "FileSpreadsheet" },
  { title: "Settings", url: "/client/cap-table/settings", icon: "ScrollText" },
];

/** Cap table for Harmonious staff — the clients they administer. */
export const capTableStaffItems: LegacyNavItem[] = [
  { title: "Client cap tables", url: "/admin/client-cap-tables", icon: "Users" },
  { title: "Cap table requests", url: "/admin/cap-table-requests", icon: "UserPlus" },
  { title: "Cap table plans", url: "/admin/cap-table-plans", icon: "Gauge" },
  { title: "Migration concierge", url: "/admin/cap-table-migrations", icon: "ScrollText" },
];

export const onboardingItems: LegacyNavItem[] = [
  { title: "KYC / AML", url: "/onboarding/compliance", icon: "BadgeCheck" },
  { title: "Accreditation", url: "/onboarding/accreditation", icon: "FileSignature" },
];

export const applicationsAndFundsItems: LegacyNavItem[] = [
  { title: "Applications", url: "/admin", icon: "ClipboardList", badge: "applications" },
  { title: "New application", url: "/admin/new-application", icon: "UserPlus" },
  { title: "Fund setup", url: "/admin/setup", icon: "Building2" },
  { title: "Fund pages", url: "/admin/funds", icon: "Building2" },
  { title: "Fund access", url: "/admin/access", icon: "BadgeCheck" },
];

export const recordsItems: LegacyNavItem[] = [
  { title: "Sign-off", url: "/admin/signoff", icon: "FileSignature", badge: "serviceRequests" },
  { title: "Client portal activity", url: "/admin/client-activity", icon: "History" },
  { title: "Onboarding funnel", url: "/admin/funnel", icon: "Gauge" },
  { title: "Document activity", url: "/admin/document-log", icon: "FileText" },
  { title: "Activity log", url: "/admin/activity", icon: "ClipboardList" },
  { title: "Audit log", url: "/admin/audit", icon: "BookLock" },
  { title: "Security", url: "/admin/security", icon: "ShieldCheck" },
  { title: "Email preview", url: "/admin/email-preview", icon: "Mail" },
];


/** Legacy internal menu groups, formerly computed inside AppSidebar. */
export function internalNavigationGroups(
  nav: NavigationSession["navigation"] | undefined,
  pathname: string,
): LegacyNavGroup[] {
  const list: LegacyNavGroup[] = [{ id: "application", label: "Your application", items: investorItems }];
  list.push({
    id: "cap-table",
    label: "CapTable",
    items: nav?.isAdmin ? [...capTableFounderItems, ...capTableStaffItems] : capTableFounderItems,
  });
  if (nav?.isReviewer) {
    list.push({ id: "funds", label: "Fund management", items: managerItems });
    const selectedFundId = pathname.match(/^\/manager\/fund\/([^/]+)/)?.[1];
    if (selectedFundId) {
      list.push({ id: "selected-fund", label: "Selected fund", items: selectedFundItems(selectedFundId) });
    }
  }
  if (nav?.isProfessional) list.push({ id: "professional", label: "Acting for clients", items: professionalItems });
  if (nav?.legacyOperationsAllowed) list.push({ id: "operations", label: "Operations", items: operationsItems });
  if (nav?.isAdmin) {
    list.push(
      { id: "clients-money", label: "Clients and money", items: clientsAndMoneyItems },
      { id: "applications-funds", label: "Applications and funds", items: applicationsAndFundsItems },
      { id: "records", label: "Records and oversight", items: recordsItems },
    );
  }
  return list;
}

export type Shell = "client" | "internal" | "ops";

export type Navigation = {
  shell: Shell;
  activeKind: WorkspaceKind | null;
  /** Client primary menu for the active workspace (workspace-specific, never merged). */
  primary: ClientNavLink[];
  /** Operations menu, from granular capabilities only. */
  operations: { id: string; title: string; url: string; icon: string }[];
  /** Legacy internal menu groups (compatibility shell for /admin pages). */
  internal: LegacyNavGroup[];
  account: ClientNavLink[];
  /** Exactly the workspaces the server resolved — nothing else. */
  switcher: NavigationSession["workspaces"];
  operationsLink: string | null;
};

const isUnder = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

/**
 * Compatibility URLs still identify the client workspace they belong to. The
 * result is only used when that workspace is present in the server-resolved
 * list, so typing a URL cannot grant a relationship.
 */
export function workspaceKindForPath(pathname: string): WorkspaceKind | null {
  if (isUnder(pathname, "/manager")) return "fund_manager";
  if (isUnder(pathname, "/client")) return "company";
  if (isUnder(pathname, "/professional")) return "professional";
  if (
    isUnder(pathname, "/dashboard") ||
    isUnder(pathname, "/portal") ||
    isUnder(pathname, "/investment")
  ) return "investor";
  return null;
}

/** Exactly one primary Operations section is active for any path. */
export function operationsNavItemIsActive(url: string, pathname: string): boolean {
  const base = url.split("?")[0] ?? url;
  const owner = activeOpsSection(pathname);
  if (base === "/ops") return owner === "home";
  return owner !== null && owner === activeOpsSection(base);
}

export function surfaceLabelForPath(pathname: string): string {
  if (isUnder(pathname, "/ops") || isUnder(pathname, "/admin") || isUnder(pathname, "/staff")) return "Harmonious Operations";
  if (isUnder(pathname, "/manager")) return "Fund management";
  if (isUnder(pathname, "/client")) return "Company workspace";
  if (isUnder(pathname, "/professional")) return "Professional workspace";
  return "Client & investor portal";
}

/**
 * The one navigation projection. `activeWorkspaceId` is untrusted browser
 * state: it is honoured only when it names a workspace the server returned.
 */
export function getNavigation(
  session: NavigationSession | null | undefined,
  activeWorkspaceId: string | null,
  pathname: string,
): Navigation {
  const workspaces = session?.workspaces ?? [];
  const pathKind = workspaceKindForPath(pathname);
  const active =
    workspaces.find((w) => pathKind !== null && w.kind === pathKind) ??
    workspaces.find((w) => w.id === activeWorkspaceId) ??
    workspaces.find((w) => w.surface === "client") ??
    workspaces[0] ??
    null;
  const activeKind = active?.kind ?? null;
  const staff = Boolean(session?.operations);
  const operations = staff ? [OPS_HOME, ...opsNavigation(session?.operationsCapabilities ?? [])] : [];

  const hasClientWorkspace = workspaces.some((w) => w.surface === "client");
  const onInternalPage = INTERNAL_PATH_PREFIXES.some((p) => isUnder(pathname, p));
  let shell: Shell;
  // Staff on any internal page, or in the Operations workspace, get the
  // canonical Operations menu — never a merged client + Operations directory.
  if (staff && (onInternalPage || (activeKind === "operations" && !hasClientWorkspace))) shell = "ops";
  else if (onInternalPage || !hasClientWorkspace || activeKind === "operations") shell = "internal";
  else shell = "client";

  return {
    shell,
    activeKind,
    primary: clientNavigation(activeKind),
    operations,
    internal: internalNavigationGroups(session?.navigation, pathname),
    account: accountMenu({ isProfessional: workspaces.some((w) => w.kind === "professional") }),
    switcher: workspaces,
    operationsLink: staff ? "/ops" : null,
  };
}

/**
 * Legacy home/dashboard routes and the canonical Home each one now renders.
 * All of them show the same Action Center read model for the given workspace.
 */
export const HOME_ROUTE_MAP: { route: string; canonical: string; workspace: WorkspaceKind | null; note: string }[] = [
  { route: "/home", canonical: "/home", workspace: null, note: "Canonical Home; Action Center for the active workspace" },
  { route: "/manager", canonical: "/home", workspace: "fund_manager", note: "Compatibility wrapper; keeps managed-fund summary" },
  { route: "/client", canonical: "/home", workspace: "company", note: "Compatibility wrapper; keeps company/services summary" },
  { route: "/professional", canonical: "/home", workspace: "professional", note: "Compatibility wrapper; keeps authorized-client list" },
  { route: "/dashboard", canonical: "/dashboard", workspace: "investor", note: "Investments page (unique subscription/funding detail), not a Home" },
  { route: "/portal", canonical: "/dashboard", workspace: "investor", note: "Compatibility: legacy investor portal retained" },
  { route: "/ops", canonical: "/ops", workspace: "operations", note: "Operations Home (work queue), separate shell" },
  { route: "/admin", canonical: "/ops", workspace: "operations", note: "Internal compatibility: applications queue" },
];
