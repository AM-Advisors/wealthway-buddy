import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ tables: {} as Record<string, any[]>, notify: vi.fn(async () => undefined) }));
vi.mock("./investor-approval-notify.server", () => ({ notifyInvestorApproval: mock.notify }));
vi.mock("./investor-progress-email.server", () => ({ captureProgress: vi.fn() }));
vi.mock("./onboarding-compliance.server", async importOriginal => {
  const original = await importOriginal<typeof import("./onboarding-compliance.server")>();
  return { ...original, loadStage2Inputs: async () => ({}), resolveStage2: async () => ({
    taxState: { state: "valid" }, taxClassificationState: { state: "valid" }, amlState: { state: "missing" },
    badActorState: { state: "missing" }, eligibilityState: { state: "valid" }, certificationState: { state: "missing" },
  }) };
});
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: (table: string) => {
  const filters: ((r: any) => boolean)[] = [];
  let change: Record<string, unknown> | undefined;
  const rows = () => (mock.tables[table] ?? []).filter(r => filters.every(f => f(r)));
  const result = () => { const selected = rows(); if (change) selected.forEach(r => Object.assign(r, change)); return { data: selected, error: null }; };
  const q: any = {
    select: () => q, order: () => q, limit: () => q,
    eq: (k: string, v: unknown) => { filters.push(r => r[k] === v); return q; },
    neq: (k: string, v: unknown) => { filters.push(r => r[k] !== v); return q; },
    is: (k: string, v: unknown) => { filters.push(r => (r[k] ?? null) === v); return q; },
    in: (k: string, v: unknown[]) => { filters.push(r => v.includes(r[k])); return q; },
    not: () => q, or: () => q,
    update: (payload: any) => { change = payload; return q; },
    insert: (payload: any) => { (mock.tables[table] ??= []).push(...(Array.isArray(payload) ? payload : [payload])); return q; },
    upsert: () => q,
    maybeSingle: async () => { const r = result(); return { ...r, data: r.data[0] ?? null }; },
    then: (resolve: any) => Promise.resolve(result()).then(resolve),
  }; return q;
} } }));
import { approveToFund, reconcileInvestmentReadiness, subscriptionApprovalAvailable, onboardingDetail } from "./investor-onboarding.server";

beforeEach(() => {
  mock.notify.mockClear();
  mock.tables = {
    user_roles: [{ user_id: "staff", role: "admin" }], fund_managers: [{ user_id: "manager", offering_id: "fable-fund" }],
    offerings: [{ id: "fable-fund", name: "Fable Fund", min_investment_cents: 10000000 }], fund_setups: [],
    investor_onboardings: [{ id: "fictional-investment", offering_id: "fable-fund", investor_user_id: "investor", person_id: "person", investment_profile_id: "profile", stage: "profile_selected", requested_amount_cents: 25000000, funding_status: "not_started" }],
    persons: [{ id: "person", user_id: "investor", kyc_status: "approved", aml_status: "approved", residence_country: "US" }],
    investment_profiles: [{ id: "profile", owner_user_id: "investor", profile_type: "individual" }],
    outside_subscription_marks: [{ onboarding_id: "fictional-investment", action: "marked", signed_on: "2026-10-09" }],
    prior_signed_documents: [{ id: "copy", onboarding_id: "fictional-investment", document_kind: "subscription_agreement", uploaded_by_role: "harmonious" }],
  };
});
describe("outside signing through the canonical workflow", () => {
  it("shows approval on a stale manual-entry record without changing it during the read", async () => {
    expect(await subscriptionApprovalAvailable("manager", "fictional-investment")).toBe(true);
    expect(mock.tables['investor_onboardings']?.[0]?.stage).toBe("profile_selected");
    expect(mock.notify).not.toHaveBeenCalled();
  });
  it("reconciles completed paperwork to review once, never funding approval", async () => {
    await reconcileInvestmentReadiness("fictional-investment", { actorUserId: "staff", trigger: "outside_subscription" });
    await reconcileInvestmentReadiness("fictional-investment", { actorUserId: "staff", trigger: "outside_subscription" });
    expect(mock.tables['investor_onboardings']?.[0]?.stage).toBe("harmonious_review");
    expect(mock.tables['investor_onboardings']?.[0]?.approved_to_fund_at).toBeUndefined();
    expect(mock.tables['investor_onboarding_events']?.filter(e => e.event === "subscription_ready_for_review")).toHaveLength(1);
    expect(mock.notify).toHaveBeenCalledTimes(1);
  });
  it("allows explicit authorized approval from the stale stage and reads completed signing back", async () => {
    expect(await approveToFund("manager", { onboardingId: "fictional-investment" })).toEqual({ approved: true, acceptedAmountCents: 25000000 });
    expect(mock.tables['investor_onboardings']?.[0]?.stage).toBe("awaiting_funds");
    expect(mock.tables['investor_onboardings']?.[0]?.approved_to_fund_by).toBe("manager");
    expect(mock.tables['investor_onboardings']?.[0]?.funding_status).toBe("not_started");
    const detail = await onboardingDetail("investor", "fictional-investment");
    expect(detail.requirements.find((r: any) => r.key === "signature")?.state).toBe("valid");
    expect(detail.approvedToFund).toBe(true);
  });
  it("does not advance or approve a record missing the retained copy", async () => {
    mock.tables['prior_signed_documents'] = [];
    expect(await subscriptionApprovalAvailable("manager", "fictional-investment")).toBe(false);
    await expect(approveToFund("manager", { onboardingId: "fictional-investment" })).rejects.toThrow(/not complete/);
    expect(mock.tables['investor_onboardings']?.[0]?.stage).toBe("profile_selected");
  });
  it("keeps other-fund and investor-self approval forbidden", async () => {
    expect(await subscriptionApprovalAvailable("outsider", "fictional-investment")).toBe(false);
    await expect(approveToFund("outsider", { onboardingId: "fictional-investment" })).rejects.toThrow(/Only authorized/);
    mock.tables['fund_managers']?.push({ user_id: "investor", offering_id: "fable-fund" });
    await expect(approveToFund("investor", { onboardingId: "fictional-investment" })).rejects.toThrow(/Another authorized reviewer/);
  });
});