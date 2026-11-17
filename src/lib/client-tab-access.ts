/**
 * Per-client tab/service switches. Pure: shared by the client menu, page guards and the staff Access panel.
 * Default follows what the client has (purchased menu keys, or everything for legacy menus);
 * a staff override always wins. Off means hidden and refused, never deleted.
 */
export const CLIENT_TABS = [
  { key: "agreements", label: "Agreements (MSA & SOWs)", prefixes: ["/client/agreements", "/manager/agreements", "/client/statements-of-work", "/client/sign-offs"] },
  { key: "funds", label: "Funds & SPVs", prefixes: ["/client/funds", "/my-funds", "/manager/fund", "/manager/funds"], needs: "fund_platform" },
  { key: "investments", label: "Investments & reporting", prefixes: ["/investor-reporting", "/distributions", "/activity", "/my-portfolio"], needs: "fund_platform" },
  { key: "cap_table", label: "Cap Table", prefixes: ["/client/cap-table", "/manager/cap-table"], needs: "cap_table" },
  { key: "wealth", label: "Wealth", prefixes: ["/wealth"], needs: "wealth" },
  { key: "banking", label: "Banking & wires", prefixes: ["/client/banking", "/client/wires"] },
  { key: "tax", label: "Tax", prefixes: ["/tax"], needs: "fund_platform" },
  { key: "documents", label: "Documents", prefixes: ["/documents"], needs: "fund_platform" },
  { key: "billing", label: "Billing & invoices", prefixes: ["/client/invoices", "/client/payments", "/client/services"] },
  { key: "messages", label: "Messages", prefixes: ["/client/inbox", "/messages", "/manager/messages"] },
] as const;
export type ClientTabKey = (typeof CLIENT_TABS)[number]["key"];

/** Whether a tab is on: an override wins; otherwise purchased keys decide (null = legacy full menu). */
export function tabEnabled(key: ClientTabKey, overrides: Record<string, boolean>, purchased: string[] | null): boolean {
  if (key in overrides) return overrides[key]!;
  const tab = CLIENT_TABS.find((t) => t.key === key);
  const needs = tab && "needs" in tab ? tab.needs : null;
  if (!needs || purchased === null) return true;
  return purchased.includes(needs);
}

export function tabForPath(path: string): ClientTabKey | null {
  for (const t of CLIENT_TABS) if (t.prefixes.some((p) => path === p || path.startsWith(`${p}/`))) return t.key;
  return null;
}

/** Tabs switched off for this client. */
export function hiddenTabs(overrides: Record<string, boolean>, purchased: string[] | null): ClientTabKey[] {
  return CLIENT_TABS.filter((t) => !tabEnabled(t.key, overrides, purchased)).map((t) => t.key);
}

/** Drop menu links whose page belongs to a switched-off tab. */
export function filterByHiddenTabs<T extends { url: string }>(links: T[], hidden: readonly string[]): T[] {
  if (!hidden.length) return links;
  return links.filter((l) => { const k = tabForPath(l.url); return !k || !hidden.includes(k); });
}

/** Areas that belong to a purchasable service; their switch sits on the service card. */
export const SERVICE_TAB_KEYS: readonly ClientTabKey[] = ["funds", "investments", "cap_table", "wealth"];
