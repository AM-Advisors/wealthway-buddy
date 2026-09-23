import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  milestones,
  ownershipFromSecurities,
  parseInvestorCsv,
  requestLifecycle,
} from "@/lib/self-service-model";

const src = (p: string) => readFileSync(p, "utf8");
const selfService = src("src/lib/self-service.functions.ts");
const captable = src("src/lib/captable.functions.ts");
const migration = src("drizzle/migrations/0031_self_service_boundaries.sql");

describe("fund request lifecycle", () => {
  it("a submitted request is not an active fund", () => {
    expect(requestLifecycle({ status: "submitted" }, null)).toBe("Submitted");
    expect(requestLifecycle({ status: "sow_issued" }, null)).toBe("Harmonious Review");
  });
  it("derives setup/action/ready from existing setup records", () => {
    expect(requestLifecycle({ status: "executed" }, { stage: "setup" }, [])).toBe("Setup in Progress");
    expect(requestLifecycle({ status: "executed" }, { stage: "setup" }, [{ section: "entity", status: "waiting_on_client" }])).toBe("Client Action Required");
    expect(requestLifecycle({ status: "executed" }, { stage: "ready_to_launch" })).toBe("Ready");
  });
  it("groups setup tasks into plain milestones", () => {
    const m = milestones([
      { section: "entity", status: "complete" },
      { section: "banking", status: "waiting_on_client" },
      { section: "documents", status: "review" },
    ]);
    const by = Object.fromEntries(m.map((x) => [x.key, x.state]));
    expect(by["entity"]).toBe("Complete");
    expect(by["banking"]).toBe("Waiting on you");
    expect(by["details"]).toBe("Harmonious is working on it");
    expect(m).toHaveLength(7);
  });
});

describe("request submission boundaries", () => {
  it("only inserts a submitted request and never creates a fund or offering config", () => {
    expect(selfService).toContain('status: "submitted"');
    expect(selfService).not.toMatch(/from\("offerings"\)\s*\.insert/);
    expect(selfService).not.toMatch(/reg_type|regulatory_structure/);
    expect(selfService).not.toContain("supabaseAdmin");
  });
  it("restricts the firm to the manager's own relationships", () => {
    expect(selfService).toContain("requestableClients");
    expect(selfService).toContain('client_role !== "client_readonly"');
    expect(selfService).toMatch(/Forbidden: you can only request a fund for your own firm/);
  });
  it("database refuses requester-linked funds or approved statuses", () => {
    expect(migration).toContain("guard_client_fund_request");
    expect(migration).toMatch(/NEW\.offering_id IS NOT NULL/);
    expect(migration).toMatch(/NOT IN \('draft','submitted','sow_issued'\)/);
  });
  it("request form has no exemption selector", () => {
    const form = src("src/routes/_authenticated/manager.request-fund.tsx");
    expect(form).not.toMatch(/506\(b\)|506\(c\)/);
    expect(form).toContain("Harmonious will review the offering structure with you.");
  });
});

describe("bulk investors", () => {
  it("flags per-row errors and duplicates without sending anything", () => {
    const rows = parseInvestorCsv(
      "name,email,amount,type\nA,a@x.com,100000,individual\nB,a@x.com,5,joint\nC,bad,,\nD,d@x.com,-3,alien\nE,e@x.com,,",
      ["e@x.com"],
    );
    expect(rows).toHaveLength(5);
    expect(rows[0]!.errors).toEqual([]);
    expect(rows[0]!.amountCents).toBe(10_000_000);
    expect(rows[1]!.errors).toContain("Duplicate email in this file");
    expect(rows[2]!.errors).toContain("Email address is not valid");
    expect(rows[3]!.errors).toEqual(expect.arrayContaining(["Amount must be a positive number", "Investor type not recognised"]));
    expect(rows[4]!.errors).toContain("Already invited to this fund");
  });
  it("sends one at a time through the email-bound invitation", () => {
    const c = src("src/components/bulk-add-investors.tsx");
    expect(c).toContain("inviteInvestorFn");
    expect(c).toContain("Review investors");
    expect(c).not.toMatch(/exemption|regType/);
  });
  it("manager investor list does not show KYC or accreditation columns", () => {
    const c = src("src/components/manager-fund-investors.tsx");
    expect(c).not.toContain("KYC / AML");
    expect(c).not.toContain("accreditationStatus");
  });
});

describe("cap table self-service", () => {
  it("company creation is limited to the caller's own company", () => {
    expect(captable).toMatch(/You can only set up the cap table for a company you administer/);
    expect(migration).toContain("cu.client_id = ct_companies.client_id");
    expect(migration).not.toContain("cu.client_id = cu.client_id");
  });
  it("stakeholder/security changes require ct_can_manage for that company", () => {
    const stake = captable.slice(captable.indexOf("export const saveCapStakeholder"), captable.indexOf("export const issueCapSecurity"));
    const issue = captable.slice(captable.indexOf("export const issueCapSecurity"), captable.indexOf("export const recordCapTransaction"));
    expect(stake).toContain("assertManage(context, data.companyId)");
    expect(issue).toContain("assertManage(context, data.companyId)");
  });
  it("adding a stakeholder creates no securities and reuses an existing holder", () => {
    const stake = captable.slice(captable.indexOf("export const saveCapStakeholder"), captable.indexOf("export const issueCapSecurity"));
    expect(stake).not.toContain("ct_securities");
    expect(stake).not.toContain("ct_transactions");
    expect(stake).toContain("reused: true");
  });
  it("ownership derives only from recorded securities", () => {
    expect(ownershipFromSecurities([]).total).toBe(0);
    const o = ownershipFromSecurities([
      { stakeholder_id: "a", quantity: 600, security_type: "common" },
      { stakeholder_id: "b", quantity: 400, security_type: "preferred" },
      { stakeholder_id: "c", quantity: 100, security_type: "option" },
      { stakeholder_id: "d", quantity: 999, security_type: "common", status: "cancelled" },
    ]);
    expect(o.total).toBe(1000);
    expect(o.holders.find((h) => h.stakeholderId === "a")!.percent).toBeCloseTo(60);
    expect(ownershipFromSecurities([{ stakeholder_id: "c", quantity: 100, security_type: "option" }, { stakeholder_id: "s", quantity: 50, security_type: "safe" }], { fullyDiluted: true }).total).toBe(100);
  });
});

describe("no approval bypass", () => {
  it("self-service code never touches compliance, cash, accounting or payments", () => {
    for (const f of [selfService, src("src/components/bulk-add-investors.tsx"), src("src/components/captable/cap-table-setup.tsx")]) {
      expect(f).not.toMatch(/kyc_verifications|aml_screenings|accreditation_records|bank_transactions|journal_entries|distribution_payments|funding_matches/);
    }
  });
  it("Operations + New is capability-based, never email-based", () => {
    const c = src("src/components/ops-home.tsx");
    expect(c).toContain("`${area}:prepare`");
    expect(c).not.toContain("@harmonious.co");
  });
  it("reads are re-authorized per request through the caller's session (revocation is immediate)", () => {
    expect(selfService).toContain("requireSupabaseAuth");
    expect(selfService).not.toMatch(/cache|memo/i);
  });
});
