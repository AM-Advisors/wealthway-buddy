/**
 * Demo funds: a fund marked as a demo, or any fund of a client marked as a test/demo.
 * Their items never become Operations tasks, and routine reviews on them approve
 * themselves so people can test without waiting. Identity checks, money steps and
 * signatures are never auto-approved by this rule.
 */
export type DemoScope = { funds: Set<string>; clients: Set<string> };

export function isDemoFundRow(offering: { is_demo?: boolean | null } | null | undefined, client?: { is_test_demo?: boolean | null } | null) {
  return Boolean(offering?.is_demo) || Boolean(client?.is_test_demo);
}

export function demoScopeFrom(
  offerings: { id: string; client_id?: string | null; is_demo?: boolean | null }[],
  clients: { id: string; is_test_demo?: boolean | null }[],
): DemoScope {
  const demoClients = new Set(clients.filter((c) => c.is_test_demo).map((c) => c.id));
  const funds = new Set(offerings.filter((o) => o.is_demo || (o.client_id && demoClients.has(o.client_id))).map((o) => o.id));
  return { funds, clients: demoClients };
}

/** An Operations item belongs to a demo when its fund or client is a demo. */
export function isDemoItem(item: { fundId?: string | null; clientId?: string | null }, scope: DemoScope) {
  return Boolean((item.fundId && scope.funds.has(item.fundId)) || (item.clientId && scope.clients.has(item.clientId)));
}

/** Only these routine reviews approve themselves on a demo fund. */
export const DEMO_AUTO_APPROVE = ["fund_economics", "fund_questionnaire_section"] as const;
export type DemoAutoApproveKind = (typeof DEMO_AUTO_APPROVE)[number];
export function demoAutoApproves(kind: string, isDemo: boolean) {
  return isDemo && (DEMO_AUTO_APPROVE as readonly string[]).includes(kind);
}

export const DEMO_AUTO_APPROVE_NOTE = "Approved automatically because this is a demo fund.";
