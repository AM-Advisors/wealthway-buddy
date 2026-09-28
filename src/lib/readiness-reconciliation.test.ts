import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { computeReadiness, readinessTransitions, readinessTaskPlan, type ReadinessInput } from "./investment-readiness";

const server = readFileSync("src/lib/investor-onboarding.server.ts", "utf8");
const fns = readFileSync("src/lib/investor-onboarding.functions.ts", "utf8");

function body(name: string) {
  const start = server.indexOf(`export async function ${name}(`);
  expect(start).toBeGreaterThan(-1);
  const next = server.indexOf("\nexport async function ", start + 10);
  return server.slice(start, next === -1 ? undefined : next);
}

const WRITE = /\.(insert|update|upsert|delete)\(|reconcile/;

describe("readiness page views are read-only", () => {
  for (const view of ["investmentReadiness", "fundReadiness", "readinessQueue", "closeReadinessFor"]) {
    it(`${view} performs no writes and triggers no reconciliation`, () => {
      expect(body(view)).not.toMatch(WRITE);
    });
  }
  it("the old render-time sync helper is gone", () => {
    expect(server).not.toContain("computeAndSyncReadiness");
  });
  it("read-only compute helper never writes", () => {
    const s = server.indexOf("async function computeReadinessFor(");
    const e = server.indexOf("export async function reconcileInvestmentReadiness(");
    expect(server.slice(s, e)).not.toMatch(/\.(insert|update|upsert|delete)\(/);
  });
  it("queue aging uses when the requirement became actionable, not page view", () => {
    expect(body("readinessQueue")).toContain("became_actionable_at");
  });
});

describe("reconciliation triggers", () => {
  for (const m of ["chooseProfile", "setInvestmentAmount", "saveQuestionnaire", "prepareSubscriptionDocuments", "recordSubscriptionSignature", "investorReportsFundsSent", "approveToFund", "setOnboardingStage", "raiseException", "applyBankActivity", "acceptSubscription", "closeInvestment"]) {
    it(`${m} reconciles after a successful mutation`, () => {
      expect(fns).toContain(`reconciled(data.onboardingId, context.userId, "${m}"`);
    });
  }
  it("resolving an exception reconciles its investment", () => {
    expect(fns).toContain("reconcileForException(data.exceptionId");
  });
  it("identity and signing provider webhooks reconcile affected investments", () => {
    expect(readFileSync("src/routes/api/public/webhooks/didit.ts", "utf8")).toContain("reconcileReadinessForSubjects");
    expect(readFileSync("src/routes/api/public/webhooks/box-sign.ts", "utf8")).toContain("reconcileReadinessForSubjects");
  });
  it("staff reconciliation is Harmonious-staff only and per investment", () => {
    expect(body("staffReconcileReadiness")).toContain("assertStaff(userId)");
  });
  it("reconciliation failures never fail the underlying mutation", () => {
    expect(body("reconcileAfter")).toMatch(/catch/);
  });
  it("work items record when they became actionable", () => {
    expect(body("reconcileInvestmentReadiness")).toContain("became_actionable_at: at");
  });
});

describe("reconciliation semantics", () => {
  const base: ReadinessInput = {
    requirements: [
      { key: "identity_verification", state: "complete" } as any,
      { key: "signature", state: "pending" } as any,
    ],
    stage: "sign",
    fundingStatus: null,
    approvedToFundAt: null,
    acceptedAt: null,
    acceptedAmountCents: null,
    closedAt: null,
    exceptions: [],
    requestedCloseDate: null,
    closeAmountCents: null,
  };
  it("history only for real transitions; re-running is idempotent", () => {
    const r = computeReadiness(base);
    const first = readinessTransitions({}, r);
    const prev: Record<string, string> = {};
    for (const t of first) prev[t.key] = t.to;
    expect(readinessTransitions(prev, r)).toEqual([]);
    expect(readinessTransitions(prev, computeReadiness(base))).toEqual([]);
  });
  it("duplicate reconciliation creates no duplicate work items", () => {
    const r = computeReadiness(base);
    const p1 = readinessTaskPlan(new Set(), r);
    const p2 = readinessTaskPlan(new Set(p1.create.map((c) => c.key)), r);
    expect(p2.create).toEqual([]);
  });
});
