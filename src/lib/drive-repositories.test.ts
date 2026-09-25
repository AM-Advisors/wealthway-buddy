import { describe, expect, it } from "vitest";

import {
  HARMONIOUS_STORAGE,
  INVESTOR_UNAVAILABLE,
  TEST_UNAVAILABLE,
  classifyDocument,
  investorMayOpenDriveFolder,
  managerMayOpenDriveFolder,
  repositoryAuditProblems,
  repositoryConfigProblem,
  repositoryFor,
  routeDocument,
  type RepositoryConfig,
} from "@/lib/drive-policy";
import { INVESTOR_SUBFOLDERS, FUND_SUBFOLDERS, filingTargets, investorKey } from "@/lib/drive-structure";

const FUND = { rootId: "FundRoot000001", driveId: "FundDrive0001" };
const INV = { rootId: "InvRoot0000001", driveId: "InvDrive00001" };
const QA = { rootId: "QaRoot00000001", driveId: "QaDrive000001" };
const full: RepositoryConfig = { fund: FUND, investor: INV, test: QA };

const route = (classification: any, text: string, over: Partial<Parameters<typeof routeDocument>[0]> = {}) =>
  routeDocument({ classification, text, environment: "production", config: full, investorRepositoryProblems: [], ...over });

const SAFE = {
  domainUsersOnly: true,
  driveMembersOnly: true,
  sharingFoldersRequiresOrganizerPermission: true,
  members: [{ type: "user", role: "organizer", email: "alyssa@harmonious.co" }],
};

describe("Two-repository routing", () => {
  it("investor documents never route to the broad Fund drive", () => {
    for (const c of ["investor_general", "investor_restricted"] as const) {
      const r = route(c, "Subscription Agreement");
      expect(r.kind).toBe("drive");
      expect((r as any).repository).toBe("investor");
      expect((r as any).root.rootId).not.toBe(FUND.rootId);
    }
  });

  it("Fund General records don't route to the restricted Investor drive", () => {
    const r = route("fund_general", "Certificate of Formation");
    expect((r as any).repository).toBe("fund");
    expect((r as any).root).toEqual(FUND);
  });

  it("Harmonious Restricted evidence stays outside Drive", () => {
    expect(route("harmonious_restricted", "AML screening")).toEqual({ kind: "excluded", reason: HARMONIOUS_STORAGE });
  });

  it("tax forms and raw KYC/AML/ID evidence stay outside Drive regardless of classification", () => {
    for (const t of ["Form W-9", "W-8BEN", "KYC report", "AML result", "passport scan", "government id"]) {
      expect(route("investor_general", t).kind).toBe("excluded");
      expect(route("fund_general", t).kind).toBe("excluded");
    }
  });

  it("production Fund and Investor roots cannot be confused", () => {
    expect(repositoryConfigProblem({ fund: FUND, investor: { ...INV, driveId: FUND.driveId }, test: QA })).toMatch(/separate shared drive/);
    expect(repositoryConfigProblem({ fund: FUND, investor: { ...INV, rootId: FUND.rootId }, test: QA })).toMatch(/same root/);
    expect(route("investor_general", "Side letter", { config: { fund: FUND, investor: { ...INV, driveId: FUND.driveId }, test: QA } }).kind).toBe("unavailable");
    expect(repositoryConfigProblem(full)).toBeNull();
  });

  it("test records never reach either production root", () => {
    const r = route("investor_general", "Side letter", { environment: "test" });
    expect((r as any).root).toEqual(QA);
    expect(route("fund_general", "LPA", { environment: "test" })).toMatchObject({ repository: "test" });
    const none = route("fund_general", "LPA", { environment: "test", config: { ...full, test: null } });
    expect(none).toEqual({ kind: "unavailable", repository: "test", reason: TEST_UNAVAILABLE });
    expect(route("fund_general", "LPA", { environment: "test", config: { ...full, test: { ...QA, driveId: FUND.driveId } } }).kind).toBe("unavailable");
    expect(repositoryFor("fund", "test")).toBe("test");
    expect(repositoryFor("investor", "test")).toBe("test");
  });

  it("an unconfigured restricted repository fails closed", () => {
    const r = route("investor_restricted", "Subscription Agreement", { config: { ...full, investor: null } });
    expect(r).toEqual({ kind: "unavailable", repository: "investor", reason: INVESTOR_UNAVAILABLE });
  });

  it("excessive permissions prevent restricted filing", () => {
    const approved = ["alyssa@harmonious.co"];
    expect(repositoryAuditProblems(SAFE, approved)).toEqual([]);
    expect(repositoryAuditProblems(null, approved).length).toBeGreaterThan(0);
    expect(repositoryAuditProblems({ ...SAFE, domainUsersOnly: false }, approved)).toContain("External users can be added.");
    expect(repositoryAuditProblems({ ...SAFE, sharingFoldersRequiresOrganizerPermission: false }, approved)).toContain("Editors can reshare folders.");
    expect(repositoryAuditProblems({ ...SAFE, driveMembersOnly: false }, approved).length).toBe(1);
    const withSales = { ...SAFE, members: [...SAFE.members, { type: "user", role: "fileOrganizer", email: "sales@harmoniouscapitaladmin.com" }] };
    expect(repositoryAuditProblems(withSales, approved)[0]).toMatch(/sales@/);
    expect(repositoryAuditProblems(SAFE, [])).toContain("No approved audience is configured.");
    const problems = repositoryAuditProblems(withSales, approved);
    expect(route("investor_restricted", "Subscription Agreement", { investorRepositoryProblems: problems }).kind).toBe("unavailable");
  });

  it("same Person with different Investment Profiles stays separated", () => {
    expect(investorKey("fund1", "profileA")).not.toBe(investorKey("fund1", "profileB"));
  });

  it("fund managers and investors never get direct Drive access", () => {
    expect(managerMayOpenDriveFolder()).toBe(false);
    expect(investorMayOpenDriveFolder()).toBe(false);
  });

  it("Box-executed documents land in exactly one restricted folder, never the Fund drive", () => {
    const sub = classifyDocument("subscription_agreement", "Subscription Agreement");
    const r = route(sub, "subscription_agreement Subscription Agreement");
    expect((r as any).repository).toBe("investor");
    expect(filingTargets("Subscription Agreement")).toEqual(["01 - Subscription Documents"]);
    expect(filingTargets("Accreditation letter")).toEqual(["02 - Accreditation"]);
    for (const t of filingTargets("Side letter")) expect(INVESTOR_SUBFOLDERS).toContain(t as any);
  });

  it("the restricted structure stays narrow and the Fund folder has no Investors subfolder", () => {
    expect([...INVESTOR_SUBFOLDERS]).toEqual(["01 - Subscription Documents", "02 - Accreditation", "03 - Approved Restricted Documents"]);
    expect(INVESTOR_SUBFOLDERS.some((n) => /tax|compliance/i.test(n))).toBe(false);
    expect((FUND_SUBFOLDERS as readonly string[]).includes("Investors")).toBe(false);
  });
});
