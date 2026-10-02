/**
 * Role dashboards - server aggregation. Every number is built here, from
 * records the caller is authorized to see, using the shared definitions in
 * dashboard-metrics.ts. The browser receives aggregates, never raw evidence.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertStaff, computeReadinessFor, onboardingActor } from "@/lib/investor-onboarding.server";
import {
  agreementCounts, attentionFromItems, bucketOf, capital, funnel, isActive, isFunded, kpis, managerReadiness,
  readinessDistribution, trend, clientStepIndex, fundingStateOf, managerBucketOf, funnelStageOf,
  type InvestmentFact, type TrendRange,
} from "@/lib/dashboard-metrics";

const db = () => supabaseAdmin as any;
const forbid = (m: string) => { throw new Error(`Forbidden: ${m}`); };

async function factsFor(rows: any[]): Promise<{ fact: InvestmentFact; row: any; result: any }[]> {
  const out = [] as { fact: InvestmentFact; row: any; result: any }[];
  for (const row of rows) {
    const { result } = await computeReadinessFor(row);
    out.push({
      row, result,
      fact: {
        onboardingId: row.id, offeringId: row.offering_id, fundingStatus: row.funding_status ?? null, stage: row.stage ?? null,
        intendedCents: row.accepted_amount_cents ?? row.requested_amount_cents ?? null, approved: !!row.approved_to_fund_at,
        createdAt: row.created_at ?? null, readiness: result,
      },
    });
  }
  return out;
}

async function trendFor(offeringIds: string[] | null, range: TrendRange) {
  const since = new Date(Date.now() - 400 * 86400000).toISOString();
  let s = db().from("investor_onboardings").select("created_at").gte("created_at", since).limit(10000);
  let c = db().from("investment_readiness_events").select("created_at").eq("requirement_key", "funding").eq("new_status", "complete").gte("created_at", since).limit(10000);
  if (offeringIds) { s = s.in("offering_id", offeringIds); c = c.in("offering_id", offeringIds); }
  const [{ data: sd }, { data: cd }] = await Promise.all([s, c]);
  return trend(((sd ?? []) as any[]).map((r) => r.created_at), ((cd ?? []) as any[]).map((r) => r.created_at), range);
}

export async function opsDashboard(userId: string, filters: { clientId?: string | undefined; fundId?: string | undefined; managerId?: string | undefined; range: TrendRange }) {
  await assertStaff(userId);
  let offQ = db().from("offerings").select("id, name, client_id, is_open").order("name").limit(1000);
  if (filters.clientId) offQ = offQ.eq("client_id", filters.clientId);
  if (filters.fundId) offQ = offQ.eq("id", filters.fundId);
  const [{ data: offs }, { data: managers }] = await Promise.all([offQ, db().from("fund_managers").select("offering_id, user_id").limit(5000)]);
  let offerings = (offs ?? []) as any[];
  if (filters.managerId) {
    const ids = new Set(((managers ?? []) as any[]).filter((m) => m.user_id === filters.managerId).map((m) => m.offering_id));
    offerings = offerings.filter((o) => ids.has(o.id));
  }
  const ids = offerings.map((o) => o.id);
  const clientIds = [...new Set(offerings.map((o) => o.client_id).filter(Boolean))] as string[];
  const [{ data: onbs }, { data: invites }, { data: reviews }, { data: clients }] = await Promise.all([
    ids.length ? db().from("investor_onboardings").select("*").in("offering_id", ids).not("stage", "in", "(declined,cancelled)").limit(5000) : { data: [] },
    ids.length ? db().from("fund_invitations").select("offering_id").in("offering_id", ids).eq("onboarding_status", "invited").limit(5000) : { data: [] },
    db().from("related_person_reviews").select("id").in("status", ["open", "review_later"]).limit(5000),
    clientIds.length ? db().from("clients").select("id, name").in("id", clientIds) : { data: [] },
  ]);
  const built = await factsFor((onbs ?? []) as any[]);
  const facts = built.map((b) => b.fact);
  const { agreementStatusForClients } = await import("@/lib/commercial-agreements.server");
  const agreements: Map<string, any> = await agreementStatusForClients(clientIds).catch(() => new Map());
  const k = kpis(facts);
  const ag = agreementCounts(clientIds.map((c) => agreements.get(c)?.overall));
  const items = attentionFromItems(facts);
  const clientName = new Map(((clients ?? []) as any[]).map((c) => [c.id, c.name]));
  const funds = offerings.map((o) => {
    const f = facts.filter((x) => x.offeringId === o.id);
    const fk = kpis(f);
    const next = built.filter((b) => b.fact.offeringId === o.id && isActive(b.fact) && b.result.nextAction).map((b) => b.result.nextAction)[0] ?? null;
    return {
      id: o.id as string, name: o.name as string, clientId: o.client_id ?? null, clientName: clientName.get(o.client_id) ?? null, isOpen: !!o.is_open,
      committedCents: capital(f).intendedCents, fundedCents: capital(f).fundedCents,
      investors: fk.investors, onboarding: fk.onboarding, ready: fk.ready, needsAttention: fk.needsHarmonious, funded: fk.funded,
      agreement: (o.client_id && agreements.get(o.client_id)?.overall) || "needs_review",
      nextAction: next ? { label: String(next.label), owner: next.owner ?? null } : null,
    };
  }).sort((a, b) => b.needsAttention - a.needsAttention || a.name.localeCompare(b.name));
  return {
    kpis: { activeFunds: offerings.filter((o) => o.is_open).length, ...k },
    funnel: funnel(facts, (invites ?? []).length),
    readiness: readinessDistribution(facts),
    capital: capital(facts),
    agreements: ag,
    attention: {
      needsHarmonious: k.needsHarmonious, waitingInvestor: k.needsInvestor, waitingFundManager: k.needsFundManager,
      agreementFollowUp: ag.follow_up + ag.needs_review, identityReview: items.identityReview,
      relatedPersonReview: (reviews ?? []).length, documentReview: items.documentReview, fundingReconciliation: items.fundingReconciliation,
    },
    trend: await trendFor(filters.fundId || filters.clientId || filters.managerId ? ids : null, filters.range),
    funds,
    filterOptions: {
      clients: ((clients ?? []) as any[]).map((c) => ({ id: c.id, name: c.name })),
      funds: offerings.map((o) => ({ id: o.id, name: o.name })),
    },
  };
}

const SAFE_ACTIVITY: Record<string, string> = {
  identity: "Verification completed",
  subscription: "Documents signed",
  funding: "Funding reconciled",
};

export async function managerFundDashboard(userId: string, offeringId: string, range: TrendRange) {
  const actor = await onboardingActor(userId);
  if (!actor.isStaff && !actor.managedOfferingIds.includes(offeringId)) forbid("you do not manage that fund.");
  const [{ data: onbs }, { data: invites }, { data: setup }, { data: events }] = await Promise.all([
    db().from("investor_onboardings").select("*").eq("offering_id", offeringId).not("stage", "in", "(declined,cancelled)").limit(5000),
    db().from("fund_invitations").select("id").eq("offering_id", offeringId).eq("onboarding_status", "invited").limit(5000),
    db().from("fund_setups").select("target_size_cents").eq("offering_id", offeringId).maybeSingle(),
    db().from("investment_readiness_events").select("onboarding_id, requirement_key, stage, new_status, created_at").eq("offering_id", offeringId)
      .eq("new_status", "complete").in("stage", Object.keys(SAFE_ACTIVITY)).order("created_at", { ascending: false }).limit(15),
  ]);
  const rows = (onbs ?? []) as any[];
  const built = await factsFor(rows);
  const facts = built.map((b) => b.fact);
  const k = kpis(facts);
  // Names only for investments in THIS fund.
  const userIds = [...new Set(rows.map((r) => r.investor_user_id).filter(Boolean))];
  const personIds = [...new Set(rows.filter((r) => !r.investor_user_id && r.person_id).map((r) => r.person_id))];
  const [{ data: profs }, { data: persons }] = await Promise.all([
    userIds.length ? db().from("profiles").select("user_id, legal_name").in("user_id", userIds) : { data: [] },
    personIds.length ? db().from("persons").select("id, legal_first_name, legal_last_name").in("id", personIds) : { data: [] },
  ]);
  const byUser = new Map(((profs ?? []) as any[]).map((p) => [p.user_id, p.legal_name]));
  const byPerson = new Map(((persons ?? []) as any[]).map((p) => [p.id, `${p.legal_first_name ?? ""} ${p.legal_last_name ?? ""}`.trim()]));
  const nameOf = (r: any) => (r?.investor_user_id ? byUser.get(r.investor_user_id) : byPerson.get(r?.person_id)) || "An investor";
  const rowById = new Map(rows.map((r) => [r.id, r]));
  const activity = [
    ...rows.map((r) => ({ at: r.created_at as string, label: "Started onboarding", onboardingId: r.id, name: nameOf(r) })),
    ...((events ?? []) as any[]).filter((e) => rowById.has(e.onboarding_id)).map((e) => ({ at: e.created_at, label: SAFE_ACTIVITY[e.stage] ?? "Progress recorded", onboardingId: e.onboarding_id, name: nameOf(rowById.get(e.onboarding_id)) })),
  ].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 10);
  const needsMe = built.filter((b) => managerBucketOf(b.fact) === "needs_me").map((b) => ({
    onboardingId: b.fact.onboardingId, name: nameOf(b.row), action: String(b.result.nextAction?.label ?? "Review investor"),
  }));
  const cap = capital(facts);
  return {
    kpis: { investors: k.investors, onboarding: k.onboarding, needsInvestor: k.needsInvestor, needsMe: needsMe.length, ready: k.ready, funded: k.funded },
    funnel: funnel(facts, (invites ?? []).length),
    readiness: managerReadiness(facts),
    capital: { ...cap, targetCents: (setup as any)?.target_size_cents ?? null },
    needsMe,
    activity,
    trend: await trendFor([offeringId], range),
  };
}

export async function investorDashboard(userId: string) {
  const actor = await onboardingActor(userId);
  const { data } = await db().from("investor_onboardings").select("*").eq("investor_user_id", actor.userId).order("created_at", { ascending: false }).limit(200);
  const rows = ((data ?? []) as any[]).filter((r) => r.stage !== "declined" && r.stage !== "cancelled");
  const built = await factsFor(rows);
  const offIds = [...new Set(rows.map((r) => r.offering_id))];
  const profIds = [...new Set(rows.map((r) => r.investment_profile_id).filter(Boolean))];
  const [{ data: offs }, { data: profs }] = await Promise.all([
    offIds.length ? db().from("offerings").select("id, name").in("id", offIds) : { data: [] },
    profIds.length ? db().from("investment_profiles").select("id, display_label").in("id", profIds) : { data: [] },
  ]);
  const off = new Map(((offs ?? []) as any[]).map((o) => [o.id, o.name]));
  const prof = new Map(((profs ?? []) as any[]).map((p) => [p.id, p.display_label]));
  const investments = built.map(({ fact, row, result }) => {
    const investorAction = result.nextAction?.owner === "investor" ? String(result.nextAction.label) : null;
    return {
      id: fact.onboardingId, fundName: off.get(row.offering_id) ?? "Fund", profileLabel: prof.get(row.investment_profile_id) ?? null,
      amountCents: fact.intendedCents, step: clientStepIndex(fact), funded: isFunded(fact), fundingState: fundingStateOf(fact),
      nextAction: investorAction, waitingOn: investorAction ? null : (result.nextAction?.owner ?? null), complete: funnelStageOf(fact) === "complete",
    };
  });
  return {
    summary: {
      investments: investments.length,
      inProgress: investments.filter((i) => !i.complete).length,
      funded: investments.filter((i) => i.funded).length,
      needsAttention: investments.filter((i) => i.nextAction).length,
    },
    investments,
    primary: investments.find((i) => i.nextAction) ?? investments.find((i) => !i.complete) ?? investments[0] ?? null,
  };
}

export { bucketOf };
