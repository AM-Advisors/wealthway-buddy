/**
 * Operations Funds dashboard — pure aggregation over canonical readiness
 * results and open work items. No manually maintained attention fields.
 */
export type FundOnboardingFact = {
  offeringId: string;
  stage: string;
  closeReady: boolean;
  terminal: string | null;
  blocked: boolean;
  nextOwner: string | null;
  fundingStatus: string | null;
};
export type OpenTask = { offeringId: string | null; owner: string | null };

export type FundMetrics = { investors: number; onboarding: number; ready: number; needsHarmonious: number; blocked: number; funded: number; needsAttention: number; waitingInvestor: number; waitingManager: number };

const empty = (): FundMetrics => ({ investors: 0, onboarding: 0, ready: 0, needsHarmonious: 0, blocked: 0, funded: 0, needsAttention: 0, waitingInvestor: 0, waitingManager: 0 });

export function fundMetrics(offeringId: string, facts: FundOnboardingFact[], tasks: OpenTask[]): FundMetrics {
  const m = empty();
  for (const f of facts) {
    if (f.offeringId !== offeringId) continue;
    m.investors++;
    if (f.fundingStatus === "funded") m.funded++;
    if (f.terminal === "closed" || f.stage === "closed") continue;
    if (f.closeReady) { m.ready++; continue; }
    m.onboarding++;
    if (f.blocked) m.blocked++;
    else if (f.nextOwner === "harmonious") m.needsHarmonious++;
    else if (f.nextOwner === "investor") m.waitingInvestor++;
    else if (f.nextOwner === "fund_manager") m.waitingManager++;
  }
  const harmoniousTasks = tasks.filter((t) => t.offeringId === offeringId && t.owner === "harmonious").length;
  m.needsAttention = Math.max(m.blocked + m.needsHarmonious, harmoniousTasks);
  return m;
}

export function totals(rows: { isOpen: boolean; metrics: FundMetrics }[]) {
  return rows.reduce(
    (t, r) => ({
      activeFunds: t.activeFunds + (r.isOpen ? 1 : 0),
      onboarding: t.onboarding + r.metrics.onboarding,
      ready: t.ready + r.metrics.ready,
      needsHarmonious: t.needsHarmonious + r.metrics.needsHarmonious,
      blocked: t.blocked + r.metrics.blocked,
    }),
    { activeFunds: 0, onboarding: 0, ready: 0, needsHarmonious: 0, blocked: 0 },
  );
}

/** Plain attention lines, only for non-zero counts. */
export function attentionLines(m: FundMetrics): string[] {
  const out: string[] = [];
  const p = (n: number, one: string, many: string) => (n === 1 ? one : many.replace("#", String(n)));
  if (m.blocked) out.push(p(m.blocked, "1 investor blocked", "# investors blocked"));
  if (m.needsHarmonious) out.push(p(m.needsHarmonious, "1 investor needs Harmonious review", "# investors need Harmonious review"));
  if (m.waitingManager) out.push(p(m.waitingManager, "1 waiting on the fund manager", "# waiting on the fund manager"));
  if (m.ready) out.push(p(m.ready, "1 investor ready for close", "# investors ready for close"));
  return out;
}

export type FundFilter = "all" | "active" | "onboarding" | "needs_harmonious" | "blocked" | "ready" | "closing_soon";

/** "Closing soon" is an explicit date window chosen by the user, not an SLA. */
export function matchesFilter(r: { isOpen: boolean; targetClose: string | null; metrics: FundMetrics }, f: FundFilter, closingWithinDays = 30, now = Date.now()) {
  switch (f) {
    case "all": return true;
    case "active": return r.isOpen;
    case "onboarding": return r.metrics.onboarding > 0;
    case "needs_harmonious": return r.metrics.needsHarmonious > 0;
    case "blocked": return r.metrics.blocked > 0;
    case "ready": return r.metrics.ready > 0;
    case "closing_soon": {
      if (!r.targetClose) return false;
      const t = new Date(r.targetClose).getTime();
      return t >= now - 86400000 && t <= now + closingWithinDays * 86400000;
    }
  }
}

/** Investors-tab totals from canonical fund readiness rows. */
export function rosterSummary(rows: { closeReady: boolean; readiness: any }[]) {
  const s = { total: rows.length, onboarding: 0, ready: 0, needsAttention: 0, funded: 0 };
  for (const r of rows) {
    const items = r.readiness?.items ?? [];
    if (items.some((i: any) => i.key === "funding" && i.status === "complete")) s.funded++;
    if (r.readiness?.terminal === "closed") continue;
    if (r.closeReady) { s.ready++; continue; }
    s.onboarding++;
    if (items.some((i: any) => i.status === "blocked" || i.status === "needs_harmonious" || i.status === "needs_fund_manager")) s.needsAttention++;
  }
  return s;
}
