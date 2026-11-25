import { clientNavigation } from "./client-navigation";
import { filterByEntitlements } from "./saas-order-model";
import { filterByHiddenTabs } from "./client-tab-access";
import { filterByServiceMenu, type ServiceMenu } from "./service-menu";
import type { Perspective } from "./view-as";

export type ClientPerspectiveMenu = {
  perspective: Perspective;
  offeringId: string | null;
  entitlements: string[] | null;
  hiddenTabs: string[];
  services: ServiceMenu;
  hasCapTable: boolean;
};

/** Presentation only, using the same filters as the ordinary client sidebar. */
export function clientPerspectiveLinks(menu: ClientPerspectiveMenu) {
  const base = clientNavigation(menu.perspective).filter((item) => menu.hasCapTable || !item.url.startsWith("/client/cap-table"));
  return filterByServiceMenu(filterByHiddenTabs(filterByEntitlements(base, menu.entitlements), menu.hiddenTabs), menu.services);
}

/** Never replaces Operations menus or an unrelated fund's navigation. */
export function usesClientPerspectiveMenu(pathname: string, staff: boolean, context: { perspective: string; offeringId: string | null } | null | undefined) {
  if (!staff || !context) return false;
  if (pathname === "/view-as") return true;
  if (context.perspective !== "fund_manager" || !context.offeringId) return false;
  const base = `/manager/fund/${context.offeringId}`;
  return pathname === base || pathname.startsWith(`${base}/`);
}

/** Preview links stay in existing read-only readers, never open staff-scoped service pages. */
export function clientPerspectiveDestination(menu: ClientPerspectiveMenu, url: string) {
  if (menu.perspective === "fund_manager" && menu.offeringId && url === "/manager") {
    return { to: "/manager/fund/$fundId" as const, params: { fundId: menu.offeringId } };
  }
  return { to: "/view-as" as const, search: { page: url } };
}