/**
 * Role dashboards — the single place every dashboard number is defined.
 *
 * Pure functions over canonical readiness results, onboarding rows, reconciled
 * funding status and commercial-agreement projections. Nothing here stores or
 * decides state; the server aggregates with these, and drill-down filters use
 * the SAME functions so a chart count always equals the filtered list.
 */

export const FUNNEL_STAGES = ["invited", "started", "verification", "sign", "funding", "complete"] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];
export const FUNNEL_LABELS: Record<FunnelStage, string> = {
  invited: "Invited", started: "Started", verification: "Verification", sign: "Sign", funding: "Funding", complete: "Complete",
};

export const READINESS_BUCKETS = ["ready", "needs_investor", "needs_fund_manager", "needs_harmonious", "under_review", "blocked"] as const;
export type ReadinessBucket = (typeof READINESS_BUCKETS)[number];
export const BUCKET_LABELS: Record<ReadinessBucket, string> = {
  ready: "Ready", needs_investor: "Needs Investor", needs_fund_manager: "Needs Fund Manager",
  needs_harmonious: "Needs Harmonious", under_review: "Under Review", blocked: "Blocked",
};

/** Manager view: no Harmonious-internal reasons; blocked collapses by owner. */
export const MANAGER_BUCKETS = ["ready", "needs_investor", "needs_me", "needs_harmonious", "under_review"] as const;
export type ManagerBucket = (typeof MANAGER_BUCKETS)[number];
export const MANAGER_BUCKET_LABELS: Record<ManagerBucket, string> = {
  ready: "Ready", needs_investor: "Needs Investor", needs_me: "Needs Me", needs_harmonious: "Needs Harmonious", under_review: "Under Review",
};

export const METRIC_DEFINITIONS = {
  intended: "Amounts investors have requested or been accepted for on active investments. Not funded money.",
  awaitingFunding: "Intended amounts on investments approved to fund whose money has not yet been reconciled.",
  funded: "Capital matched and reconciled to the investment. A wire the investor reports sending does not count until reconciled.",
  ready: "Investments whose readiness checklist is complete for close.",
  onboarding: "Active investments that are not yet ready to close.",
  needsHarmonious: "Active investments whose next action belongs to Harmonious (including reviews and blocked items).",
} as const;

type Item = { key?: string; stage?: string; status?: string; owner?: string | null };
export type ReadinessLike = {
  items?: Item[];
  currentStage?: string;
  closeReady?: boolean;
  terminal?: string | null;
  nextAction?: { label: string; owner: string | null } | null;
};
export type InvestmentFact = {
  onboardingId: string;
  offeringId: string;
  clientId?: string | null;
  fundingStatus: string | null;
  stage?: string | null;
  intendedCents: number | null;
  approved?: boolean;
  createdAt?: string | null;
  readiness: ReadinessLike | null;
};

/** Funded only when the canonical funding status is reconciled "funded". */
export function isFunded(f: Pick<InvestmentFact, "fundingStatus" | "readiness">): boolean {
  if (f.fundingStatus === "funded") return true;
  return !!f.readiness?.items?.some((i) => i.key === "funding" && i.status === "complete") && f.fundingStatus !== "investor_reports_sent";
}

export function isTerminal(f: InvestmentFact): boolean {
  const t = f.readiness?.terminal ?? null;
  return t === "declined" || t === "cancelled";
}
export function isClosed(f: InvestmentFact): boolean {
  return f.readiness?.terminal === "closed" || f.stage === "closed";
}
/** Active = not declined/cancelled/closed. */
export function isActive(f: InvestmentFact): boolean {
  return !isTerminal(f) && !isClosed(f);
}

export function funnelStageOf(f: InvestmentFact): FunnelStage {
  if (isClosed(f) || isFunded(f)) return "complete";
  const s = f.readiness?.currentStage ?? "investment_profile";
  if (s === "investment_profile") return "started";
  if (s === "identity" || s === "eligibility" || s === "tax") return "verification";
  if (s === "subscription") return "sign";
  return "funding";
}

export function bucketOf(f: InvestmentFact): ReadinessBucket | null {
  if (!isActive(f)) return null;
  const r = f.readiness;
  if (!r) return null;
  if (r.closeReady) return "ready";
  const items = r.items ?? [];
  if (items.some((i) => i.status === "blocked")) return "blocked";
  const owner = r.nextAction?.owner ?? null;
  if (owner === "investor") return "needs_investor";
  if (owner === "fund_manager") return "needs_fund_manager";
  const next = items.find((i) => i.owner === "harmonious" && (i.status === "under_review" || i.status === "needs_harmonious"));
  if (next?.status === "under_review") return "under_review";
  if (owner === "harmonious" || next) return "needs_harmonious";
  return "needs_investor";
}

export function managerBucketOf(f: InvestmentFact): ManagerBucket | null {
  const b = bucketOf(f);
  if (!b) return null;
  if (b === "needs_fund_manager") return "needs_me";
  if (b === "blocked") {
    const blocked = (f.readiness?.items ?? []).find((i) => i.status === "blocked");
    return blocked?.owner === "fund_manager" ? "needs_me" : blocked?.owner === "investor" ? "needs_investor" : "needs_harmonious";
  }
  return b;
}

export type Count = { key: string; label: string; count: number; percent: number | null };

export function funnel(facts: InvestmentFact[], pendingInvites: number): Count[] {
  const c: Record<FunnelStage, number> = { invited: pendingInvites, started: 0, verification: 0, sign: 0, funding: 0, complete: 0 };
  for (const f of facts) if (!isTerminal(f)) c[funnelStageOf(f)]++;
  const total = FUNNEL_STAGES.reduce((s, k) => s + c[k], 0);
  return FUNNEL_STAGES.map((k) => ({ key: k, label: FUNNEL_LABELS[k], count: c[k], percent: total ? Math.round((c[k] / total) * 100) : null }));
}

export function readinessDistribution(facts: InvestmentFact[]): Count[] {
  const c = Object.fromEntries(READINESS_BUCKETS.map((b) => [b, 0])) as Record<ReadinessBucket, number>;
  for (const f of facts) { const b = bucketOf(f); if (b) c[b]++; }
  const total = READINESS_BUCKETS.reduce((s, k) => s + c[k], 0);
  return READINESS_BUCKETS.map((k) => ({ key: k, label: BUCKET_LABELS[k], count: c[k], percent: total ? Math.round((c[k] / total) * 100) : null }));
}

export function managerReadiness(facts: InvestmentFact[]): Count[] {
  const c = Object.fromEntries(MANAGER_BUCKETS.map((b) => [b, 0])) as Record<ManagerBucket, number>;
  for (const f of facts) { const b = managerBucketOf(f); if (b) c[b]++; }
  const total = MANAGER_BUCKETS.reduce((s, k) => s + c[k], 0);
  return MANAGER_BUCKETS.map((k) => ({ key: k, label: MANAGER_BUCKET_LABELS[k], count: c[k], percent: total ? Math.round((c[k] / total) * 100) : null }));
}

export type Capital = { intendedCents: number; awaitingFundingCents: number; fundedCents: number };
export function capital(facts: InvestmentFact[]): Capital {
  const out = { intendedCents: 0, awaitingFundingCents: 0, fundedCents: 0 };
  for (const f of facts) {
    if (isTerminal(f)) continue;
    const amt = Number(f.intendedCents ?? 0);
    if (isFunded(f)) { out.fundedCents += amt; continue; }
    if (isClosed(f)) continue;
    out.intendedCents += amt;
    if (f.approved) out.awaitingFundingCents += amt;
  }
  return out;
}

export type Kpis = { investors: number; onboarding: number; ready: number; needsHarmonious: number; needsInvestor: number; needsFundManager: number; funded: number };
export function kpis(facts: InvestmentFact[]): Kpis {
  const k = { investors: 0, onboarding: 0, ready: 0, needsHarmonious: 0, needsInvestor: 0, needsFundManager: 0, funded: 0 };
  for (const f of facts) {
    if (isTerminal(f)) continue;
    k.investors++;
    if (isFunded(f)) k.funded++;
    const b = bucketOf(f);
    if (!b) continue;
    if (b === "ready") { k.ready++; continue; }
    k.onboarding++;
    if (b === "needs_harmonious" || b === "under_review" || b === "blocked") k.needsHarmonious++;
    else if (b === "needs_investor") k.needsInvestor++;
    else if (b === "needs_fund_manager") k.needsFundManager++;
  }
  return k;
}

/** Attention categories derived from readiness items (no raw evidence). */
export function attentionFromItems(facts: InvestmentFact[]) {
  const a = { identityReview: 0, documentReview: 0, fundingReconciliation: 0 };
  for (const f of facts) {
    if (!isActive(f)) continue;
    const items = f.readiness?.items ?? [];
    const harm = (stages: string[]) => items.some((i) => stages.includes(String(i.stage)) && i.owner === "harmonious" && i.status !== "complete" && i.status !== "not_applicable");
    if (harm(["identity"])) a.identityReview++;
    if (harm(["subscription"])) a.documentReview++;
    if (harm(["funding"])) a.fundingReconciliation++;
  }
  return a;
}

export function agreementCounts(overall: (string | null | undefined)[]) {
  const c = { complete: 0, follow_up: 0, needs_review: 0 };
  for (const o of overall) {
    if (o === "complete") c.complete++;
    else if (o === "follow_up") c.follow_up++;
    else c.needs_review++;
  }
  return c;
}

export const TREND_RANGES = { "30d": 30, "90d": 90, "12m": 365 } as const;
export type TrendRange = keyof typeof TREND_RANGES;
export type TrendPoint = { bucket: string; started: number; completed: number };

/**
 * Buckets only real recorded timestamps. Returns null when there are fewer
 * than two recorded events in range — the UI then explains instead of drawing.
 */
export function trend(started: string[], completed: string[], range: TrendRange, now = Date.now()): TrendPoint[] | null {
  const days = TREND_RANGES[range];
  const from = now - days * 86400000;
  const monthly = range === "12m";
  const key = (iso: string) => { const d = new Date(iso); return monthly ? d.toISOString().slice(0, 7) : d.toISOString().slice(0, 10); };
  const inRange = (iso: string) => { const t = new Date(iso).getTime(); return t >= from && t <= now; };
  const s = started.filter(inRange), c = completed.filter(inRange);
  if (s.length + c.length < 2) return null;
  const map = new Map<string, TrendPoint>();
  for (const i of s) { const k = key(i); const p = map.get(k) ?? { bucket: k, started: 0, completed: 0 }; p.started++; map.set(k, p); }
  for (const i of c) { const k = key(i); const p = map.get(k) ?? { bucket: k, started: 0, completed: 0 }; p.completed++; map.set(k, p); }
  return [...map.values()].sort((a, b) => a.bucket.localeCompare(b.bucket));
}

/** Investor-facing 4-step progress and funding state. */
export const CLIENT_STEPS = ["About You", "Verification", "Sign", "Fund"] as const;
export function clientStepIndex(f: InvestmentFact): number {
  const s = funnelStageOf(f);
  return s === "started" ? 0 : s === "verification" ? 1 : s === "sign" ? 2 : s === "funding" ? 3 : 4;
}
export type FundingState = "not_ready" | "ready_to_fund" | "funding_pending" | "funded";
export const FUNDING_STATE_LABELS: Record<FundingState, string> = {
  not_ready: "Not Ready to Fund", ready_to_fund: "Ready to Fund", funding_pending: "Funding Pending", funded: "Funded",
};
export function fundingStateOf(f: InvestmentFact): FundingState {
  if (isFunded(f)) return "funded";
  if (!f.approved) return "not_ready";
  if (f.fundingStatus && f.fundingStatus !== "not_started" && f.fundingStatus !== "awaiting_funds") return "funding_pending";
  return "ready_to_fund";
}
