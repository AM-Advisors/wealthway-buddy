import { describe, expect, it } from "vitest";
import { packageLabel, computeSla, rankItem, prioritize, capacityStatus, capacityLoad, limitStatus, investorExceptionType, bulkAllowed, reportStatus, weightFor, DEFAULT_WEIGHTS } from "./ops-command";
import { requiredApproversByPolicy, type ApprovalPolicy } from "./approval-types";

const T = "2026-10-07";
const base = { kind: "task" as const, id: "1", title: "x", href: "", fundId: "f", fundName: "F", clientName: "C", packageLabel: "SPV · Core", product: "SPV_ADMINISTRATION", level: "CORE",
  due: null as string | null, priority: "normal" as const, responsibility: "HARMONIOUS_HANDLING" as const, assignedUserId: "u", assignedName: null, team: "ops", category: null as string | null, highRisk: false, sla: null as any };

describe("package identity", () => {
  it("is always product-qualified", () => {
    expect(packageLabel("SPV_ADMINISTRATION", "CORE")).toBe("SPV · Core");
    expect(packageLabel("FUND_ADMINISTRATION", "CORE")).toBe("Fund · Core");
    expect(packageLabel("FUND_ADMINISTRATION", "WHITE_GLOVE")).toBe("Fund · White Glove");
    expect(packageLabel(null, "CORE")).toBe("No engagement");
  });
});

describe("SLA status", () => {
  const now = Date.parse("2026-10-07T12:00:00Z");
  const r = (h: number, startedHoursAgo: number, extra: any = {}) => ({ sla_hours: h, submitted_at: new Date(now - startedHoursAgo * 3600000).toISOString(), sla_due_at: new Date(now - startedHoursAgo * 3600000 + h * 3600000).toISOString(), sla_paused_at: null, sla_paused_minutes: 0, first_response_at: null, ...extra });
  it("uses the policy warning percentage", () => {
    expect(computeSla(r(24, 10), 75, now).status).toBe("HEALTHY");
    expect(computeSla(r(24, 14), 75, now).status).toBe("APPROACHING");
    expect(computeSla(r(24, 19), 75, now).status).toBe("AT_RISK");
    expect(computeSla(r(24, 19), 90, now).status).toBe("APPROACHING");
    expect(computeSla(r(24, 25), 75, now).status).toBe("BREACHED");
  });
  it("paused time does not count; not configured has no countdown", () => {
    expect(computeSla(r(24, 25, { sla_paused_minutes: 300 }), 75, now).status).toBe("AT_RISK");
    expect(computeSla(r(24, 5, { sla_paused_at: new Date(now - 3600000).toISOString() }), 75, now).status).toBe("PAUSED");
    const nc = computeSla({ ...r(24, 1), sla_hours: null, sla_due_at: null }, 75, now);
    expect(nc.status).toBe("NOT_CONFIGURED"); expect(nc.remainingMinutes).toBeNull();
  });
});

describe("priority", () => {
  it("follows the brief order, not creation date", () => {
    expect(rankItem({ ...base, due: "2026-10-01", priority: "high", category: "TAX" }, T).rank).toBe(1);
    expect(rankItem({ ...base, sla: "BREACHED" }, T).rank).toBe(2);
    expect(rankItem({ ...base, highRisk: true }, T).rank).toBe(3);
    expect(rankItem({ ...base, sla: "AT_RISK" }, T).rank).toBe(4);
    expect(rankItem({ ...base, due: "2026-10-01", responsibility: "CLIENT_APPROVAL_REQUIRED" }, T).rank).toBe(5);
    expect(rankItem({ ...base, due: "2026-10-01", responsibility: "CLIENT_INFORMATION_REQUIRED" }, T).rank).toBe(6);
    expect(rankItem({ ...base, due: "2026-10-01" }, T).rank).toBe(11);
    const list = prioritize([{ ...base, id: "a", due: "2026-10-01" }, { ...base, id: "b", sla: "BREACHED" }], T);
    expect(list[0]!.id).toBe("b");
  });
});

describe("capacity, limits, weights", () => {
  const t = { expected_load: 10, elevated_pct: 80, high_pct: 100, over_pct: 120 };
  it("status from weighted load", () => {
    expect(capacityStatus(5, t)).toBe("NORMAL"); expect(capacityStatus(8, t)).toBe("ELEVATED"); expect(capacityStatus(10, t)).toBe("HIGH"); expect(capacityStatus(12, t)).toBe("OVER_CAPACITY");
    expect(capacityLoad({ weightedEngagements: 4, openTasks: 0, overdue: 0, slaAtRisk: 0, slaBreached: 2 })).toBe(5);
  });
  it("weights are product + level", () => {
    expect(weightFor(DEFAULT_WEIGHTS, "SPV_ADMINISTRATION", "WHITE_GLOVE")).toBe(1);
    expect(weightFor(DEFAULT_WEIGHTS, "FUND_ADMINISTRATION", "WHITE_GLOVE")).toBe(1.75);
  });
  it("limit thresholds 80/100", () => {
    expect(limitStatus(40, 50).status).toBe("APPROACHING"); expect(limitStatus(50, 50).status).toBe("REVIEW_REQUIRED"); expect(limitStatus(10, null).status).toBe("NO_LIMIT");
  });
});

describe("investor exceptions, bulk, reporting", () => {
  it("maps readiness requirements", () => {
    expect(investorExceptionType("identity_verification")).toBe("KYC Incomplete");
    expect(investorExceptionType("signature")).toBe("Subscription Unsigned");
    expect(investorExceptionType("funding")).toBe("Funding Outstanding");
  });
  it("bulk never touches approvals or payments", () => {
    expect(bulkAllowed("priority", "task")).toBe(true);
    expect(bulkAllowed("priority", "approval")).toBe(false);
    expect(bulkAllowed("acknowledge", "exception")).toBe(true);
    expect(bulkAllowed("approve", "approval")).toBe(false);
  });
  it("overdue reports", () => {
    expect(reportStatus({ report_status: "PREPARING", status: "SCHEDULED", due_date: "2026-10-01" }, T)).toBe("OVERDUE");
    expect(reportStatus({ report_status: "RELEASED", status: "COMPLETED", due_date: "2026-10-01" }, T)).toBe("RELEASED");
  });
});

describe("approval policies", () => {
  const P = (type: string, threshold: number | null, extra: Partial<ApprovalPolicy> = {}): ApprovalPolicy => ({ approval_type: type, threshold_amount: threshold, second_approver_required: true, step_up_required: false, authorized_signer_required: false, client_id: null, active: true, effective_from: "2026-01-01", effective_to: null, ...extra });
  const pol = [P("PAYMENT", null), P("DISTRIBUTION", 250000), P("CAPITAL_CALL", 1000000), P("DISTRIBUTION", 100000, { client_id: "c1" })];
  it("thresholds come from configuration with client overrides", () => {
    expect(requiredApproversByPolicy("PAYMENT", 1, pol).approvers).toBe(2);
    expect(requiredApproversByPolicy("DISTRIBUTION", 200000, pol).approvers).toBe(1);
    expect(requiredApproversByPolicy("DISTRIBUTION", 200000, pol, "c1").approvers).toBe(2);
    expect(requiredApproversByPolicy("CAPITAL_CALL", 1000000, pol).approvers).toBe(2);
    expect(requiredApproversByPolicy("NAV", 9e9, pol).approvers).toBe(1);
  });
});
