/**
 * Optional services in the client menu (Wealth & services, Report Cards).
 * Pure: the sidebar and quick search hide a service link unless the signed-in
 * person actually has that service. Hiding a link grants and removes nothing;
 * every page still checks access on the server.
 */
export type ServiceMenu = { wealth: boolean; reportCards: boolean };
export type ServiceMenuKey = keyof ServiceMenu;

const AREAS: { key: ServiceMenuKey; prefixes: string[] }[] = [
  { key: "wealth", prefixes: ["/wealth"] },
  { key: "reportCards", prefixes: ["/investor-report-cards", "/manager/report-cards", "/client/report-cards"] },
];

export function serviceAreaForPath(url: string): ServiceMenuKey | null {
  const path = url.split("?")[0] ?? url;
  for (const a of AREAS) if (a.prefixes.some((p) => path === p || path.startsWith(`${p}/`))) return a.key;
  return null;
}

/** Drop optional-service links the person doesn't have. Unknown (null) hides them until confirmed. */
export function filterByServiceMenu<T extends { url: string }>(links: T[], menu: ServiceMenu | null): T[] {
  return links.filter((l) => {
    const k = serviceAreaForPath(l.url);
    return !k || Boolean(menu?.[k]);
  });
}

export type ServiceMenuFacts = {
  staff: boolean;
  /** Selection rows (newest first per scope is decided here). */
  selections: { offering_id: string | null; services: string[] | null; created_at: string }[];
  /** Any personal holdings, portfolio records, published wealth reports or linked accounts. */
  hasWealthRecords: boolean;
  /** Investor risk report cards this person recorded. */
  hasInvestorCards: boolean;
  /** Included client service entitlement keys for the person's clients. */
  clientServiceKeys: string[];
  /** Report Cards switched on (fund add-on or whole client) for a fund or client they belong to. */
  reportCardsCoverage: boolean;
  /** Staff switches for their clients: true = turned on. */
  overrides: { wealth?: boolean; report_cards?: boolean };
};

/** Latest selection per scope (personal or one fund); later rows replace earlier ones. */
export function currentSelections(rows: ServiceMenuFacts["selections"]): Map<string, string[]> {
  const out = new Map<string, { at: string; services: string[] }>();
  for (const r of rows) {
    const scope = r.offering_id ?? "personal";
    const prev = out.get(scope);
    if (!prev || r.created_at > prev.at) out.set(scope, { at: r.created_at, services: r.services ?? [] });
  }
  return new Map([...out].map(([k, v]) => [k, v.services]));
}

export function resolveServiceMenu(f: ServiceMenuFacts): ServiceMenu {
  if (f.staff) return { wealth: true, reportCards: true };
  const current = [...currentSelections(f.selections).values()];
  const selected = (key: string) => current.some((s) => s.includes(key));
  const clientWealth = f.clientServiceKeys.some((k) => k.startsWith("wealth") || k.startsWith("portfolio"));
  const clientCards = f.clientServiceKeys.some((k) => k.startsWith("report_card"));
  return {
    wealth: Boolean(f.overrides.wealth) || clientWealth || f.hasWealthRecords || current.some((s) => s.length > 0),
    reportCards: Boolean(f.overrides.report_cards) || clientCards || f.reportCardsCoverage || f.hasInvestorCards || selected("report_cards"),
  };
}
