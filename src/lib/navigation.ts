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

/** The session fields navigation may read - all produced by resolveSession. */
export type NavigationSession = {
  operations: boolean;
  staffRoles?: readonly string[];
  operationsCapabilities?: readonly OpsCapability[];
  workspaces: { kind: WorkspaceKind; id: string; label: string; path: string; surface: "client" | "ops" }[];
  navigation?: {
    isAdmin: boolean;
    isReviewer: boolean;
    legacyOperationsAllowed: boolean;
    isProfessional: boolean;
  };
};

export type Shell = "client" | "ops";

export type Navigation = {
  shell: Shell;
  activeKind: WorkspaceKind | null;
  /** Client primary menu for the active workspace (workspace-specific, never merged). */
  primary: ClientNavLink[];
  /** Operations menu, from granular capabilities only. */
  operations: { id: string; title: string; url: string; icon: string }[];
  account: ClientNavLink[];
  /** Exactly the workspaces the server resolved - nothing else. */
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
    isUnder(pathname, "/investment") ||
    isUnder(pathname, "/my-funds")
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
  if (isUnder(pathname, "/ops") || isUnder(pathname, "/admin") || isUnder(pathname, "/staff") || isUnder(pathname, "/sales")) return "Harmonious Operations";
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
  const commercialStaff = Boolean(session?.staffRoles?.some((role) => role === "sales" || role === "sales_management"));
  const salesPage = isUnder(pathname, "/sales");
  const operations = staff ? [OPS_HOME, ...opsNavigation(session?.operationsCapabilities ?? [])] : commercialStaff && salesPage
    ? [{ id: "sales", title: "Sales", url: "/sales", icon: "briefcase" }, { id: "sales-crm", title: "Contacts & deals", url: "/sales/crm", icon: "people" }] : [];

  const hasClientWorkspace = workspaces.some((w) => w.surface === "client");
  const onInternalPage = INTERNAL_PATH_PREFIXES.some((p) => isUnder(pathname, p));
  // Staff on any internal page, or in the Operations workspace, get the
  // canonical Operations menu. Everyone else gets the client menu for their
  // resolved workspace. The retired legacy sidebar has no branch here.
  const shell: Shell =
    (staff && (onInternalPage || salesPage || activeKind === "operations" || !hasClientWorkspace)) || (commercialStaff && salesPage) ? "ops" : "client";

  return {
    shell,
    activeKind,
    primary: clientNavigation(activeKind),
    operations,
    account: accountMenu({ isProfessional: workspaces.some((w) => w.kind === "professional") }),
    switcher: workspaces,
    operationsLink: staff ? "/ops" : null,
  };
}

/**
 * Home routes and where each one lands. /dashboard and /portal are retired:
 * they render nothing and redirect to the server-resolved workspace.
 */
export const HOME_ROUTE_MAP: { route: string; canonical: string; workspace: WorkspaceKind | null; note: string }[] = [
  { route: "/home", canonical: "/home", workspace: null, note: "Canonical Home; Action Center for the active workspace" },
  { route: "/manager", canonical: "/home", workspace: "fund_manager", note: "Compatibility wrapper; keeps managed-fund summary" },
  { route: "/client", canonical: "/home", workspace: "company", note: "Compatibility wrapper; keeps company/services summary" },
  { route: "/professional", canonical: "/home", workspace: "professional", note: "Compatibility wrapper; keeps authorized-client list" },
  { route: "/ops", canonical: "/ops", workspace: "operations", note: "Operations Home (work queue), separate shell" },
  { route: "/admin", canonical: "/ops", workspace: "operations", note: "Internal compatibility: applications queue" },
];

/** Retired legacy homes. Requests redirect to the resolved workspace; never rendered. */
export const RETIRED_HOME_ALIASES = ["/dashboard", "/portal"] as const;
