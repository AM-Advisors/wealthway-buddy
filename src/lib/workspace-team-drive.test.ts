import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileStatus, folderProblem, isBlockedFromInvestorDrive, missingFromDrive, proposedClassification, driveIndicator, BLOCKED_MESSAGE } from "@/lib/investor-drive";
import { maskEmail, mergeRelationships } from "@/lib/client-people";

const src = (p: string) => readFileSync(p, "utf8");
const fnBody = (file: string, name: string) => {
  const s = src(file); const a = s.indexOf(`export const ${name}`); const b = s.indexOf("export const", a + 10);
  return s.slice(a, b > 0 ? b : undefined);
};
const INV = "src/lib/invitations.functions.ts";
const DRV = "src/lib/investor-drive.functions.ts";

describe("Fund Team — server authorization", () => {
  it("view is fund-scoped", () => expect(fnBody(INV, "getFundTeam")).toMatch(/assertFundAllowed\(ctx, data\.fundId\)/));
  for (const n of ["searchFundTeamCandidates", "addFundTeamMember", "removeFundTeamMember"]) {
    it(`${n}: exact fund + Harmonious staff only (managers cannot grant authority)`, () => {
      const b = fnBody(INV, n);
      expect(b).toMatch(/assertFundAllowed\(ctx, data\.fundId\)/);
      expect(b).toMatch(/if \(!ctx\.isAdmin\) throw/);
    });
  }
  it("add is duplicate-safe, audited through grantFundAccess, sends no email", () => {
    const b = fnBody(INV, "addFundTeamMember");
    expect(b).toMatch(/already_on_team/);
    expect(b).toMatch(/grantFundAccess\(/);
    expect(b).toMatch(/offeringIds: \[data\.fundId\]/);
    expect(b).toMatch(/sendEmail: false/);
  });
  it("remove affects only this fund's assignment; no account deletion", () => {
    const b = fnBody(INV, "removeFundTeamMember");
    expect(b).toMatch(/removeAccessFor\(userId, data\.userId, data\.fundId, "fund_manager"\)/);
    expect(b).not.toMatch(/deleteUser|auth\.admin\.delete|from\("profiles"\)\.delete/);
    expect(src(INV)).toMatch(/\.eq\("offering_id", offeringId\)/);
  });
});

describe("Client People", () => {
  it("masks email and merges relationships per person with reasons", () => {
    expect(maskEmail("jane@x.com")).toBe("j•••@x.com");
    const rows = mergeRelationships(
      [{ userId: "u1", kind: "investor", offeringId: "f1" }, { userId: "u1", kind: "fund_manager", offeringId: "f2" }, { userId: "u1", kind: "investor", offeringId: "f1" }],
      new Map([["u1", { name: "Jane", email: "j•••@x.com" }]]),
      new Map([["f1", "Fund One"], ["f2", "Fund Two"]]),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.relationships.map((r) => r.label)).toEqual(["Investor — Fund One", "Fund manager — Fund Two"]);
  });
  it("derives only from real records — never email/domain; exposes no private evidence", () => {
    const s = src("src/lib/client-admin.functions.ts");
    const a = s.indexOf("async function clientRelationshipPeople"); const body = s.slice(a, s.indexOf("const personInput", a));
    expect(body).toMatch(/investor_applications/);
    expect(body).toMatch(/delegations/);
    expect(body).not.toMatch(/ilike|domain|tax|kyc|accredit|government|documents/i);
  });
});

describe("Add Fund from Client", () => {
  it("retry-safe and makes no downstream records", () => {
    const b = fnBody("src/lib/client-admin.functions.ts", "createClientFund");
    expect(b).toMatch(/clientGate\(context, "link_funds"\)/);
    expect(b).toMatch(/fund_create_duplicate_prevented/);
    expect(b).toMatch(/is_open: false/);
    expect(b).not.toMatch(/investor_applications|bank_accounts|journal|drive_folder_mappings|ensureFundStructure|client_sows"\)\.insert/);
  });
});

describe("Investor Google Drive connection — rules", () => {
  const root = { driveId: "DRIVE_RESTRICTED", rootId: "ROOT_RESTRICTED" };
  const folder = (o: Partial<any> = {}) => ({ id: "F1", mimeType: "application/vnd.google-apps.folder", driveId: root.driveId, ancestors: ["X", root.rootId], ...o });
  it("approved repository only; arbitrary drive and outside-root rejected; fail closed without config", () => {
    expect(folderProblem(folder(), root)).toBeNull();
    expect(folderProblem(folder({ driveId: "FUNDS_DRIVE" }), root)).toMatch(/outside/);
    expect(folderProblem(folder({ ancestors: ["OTHER"] }), root)).toMatch(/outside/);
    expect(folderProblem(folder({ id: root.rootId }), root)).toMatch(/root/);
    expect(folderProblem(folder(), null)).toMatch(/unavailable/);
    expect(folderProblem(null, root)).toBeTruthy();
  });
  it("blocks tax, government ID, raw KYC/KYB/AML and credentials with no override", () => {
    for (const n of ["W-9 Jane.pdf", "W8-BEN-E.pdf", "Passport scan.jpg", "Drivers License.png", "KYC report.pdf", "KYB pack.pdf", "AML screening.pdf", "OFAC result.pdf", "Didit export.json", "api key.txt", "Tax intake.pdf"]) {
      expect(isBlockedFromInvestorDrive(n)).toBe(true);
    }
    expect(isBlockedFromInvestorDrive("Executed Subscription Agreement.pdf")).toBe(false);
    expect(BLOCKED_MESSAGE).toBe("Blocked — this document type cannot be imported from Google Drive.");
    expect(src(DRV)).not.toMatch(/override/i);
  });
  const ctx = { offeringId: "o1", profileId: "p1" };
  const file = { id: "d1", name: "Subscription.pdf", mimeType: "application/pdf", modifiedTime: "2026-01-02T00:00:00.000Z", md5Checksum: "aaa" };
  const prior = (o: Partial<any> = {}) => ({ id: "h1", drive_file_id: "d1", drive_modified_at: "2026-01-02T00:00:00.000Z", drive_md5: "aaa", offering_id: "o1", investment_profile_id: "p1", version_number: 1, ...o });
  it("duplicate import shows current; changed Drive file needs review (no overwrite)", () => {
    expect(fileStatus(file, [], ctx)).toBe("new");
    expect(fileStatus(file, [prior()], ctx)).toBe("current");
    expect(fileStatus({ ...file, md5Checksum: "bbb" }, [prior()], ctx)).toBe("updated");
  });
  it("cross-fund / cross-profile copy is flagged, not associated", () => {
    expect(fileStatus(file, [prior({ investment_profile_id: "p2" })], ctx)).toBe("other_context");
    expect(fileStatus(file, [prior({ offering_id: "o2" })], ctx)).toBe("other_context");
  });
  it("Drive deletion only reports missing — Harmonious copy kept", () => {
    expect(missingFromDrive([], [prior()], ctx)).toEqual(["h1"]);
    expect(src(DRV)).not.toMatch(/drive_imported_documents"\)\.delete|\.delete\(\)/);
  });
  it("classification is a suggestion within the investor model", () => {
    expect(proposedClassification("Accreditation verification letter.pdf")).toEqual({ classification: "investor_restricted", documentType: "accreditation_evidence" });
    expect(driveIndicator(false, null)).toBe("Not Connected");
    expect(driveIndicator(true, { updated: 1 })).toBe("Updates Available");
  });
});

describe("Investor Google Drive connection — server", () => {
  const s = src(DRV);
  it("every action is Super-Administrator gated; mutations re-run the repository safety check", () => {
    for (const n of ["getInvestorDriveIntake", "searchInvestorFolders", "connectInvestorFolder", "disconnectInvestorFolder", "checkInvestorFolder", "importInvestorDriveFiles"]) {
      expect(fnBody(DRV, n)).toMatch(/requireSuperAdmin|await gate\(context/);
    }
    expect(s).toMatch(/investorRepositoryProblems\("production"\)/);
    expect(s).toMatch(/if \(env !== "production"\) throw new Error\(INVESTOR_UNAVAILABLE\)/);
  });
  it("connect requires one unambiguous Fund/Investor/Profile and never creates, renames or shares", () => {
    const b = fnBody(DRV, "connectInvestorFolder");
    expect(b).toMatch(/unambiguously/);
    expect(b).toMatch(/different fund or profile/);
    expect(s).not.toMatch(/ensureInvestorStructure|ensureInvestorFundFolder|linkExistingFolder|renameFolder|createFolder|permissions/);
  });
  it("import only from inside the connected folder, through the canonical importer", () => {
    const b = fnBody(DRV, "importInvestorDriveFiles");
    expect(b).toMatch(/ancestors\.includes\(conn\.folder_id\)/);
    expect(b).toMatch(/importOne\(/);
    expect(b).toMatch(/investment_profile_id|profileId: conn\.investment_profile_id/);
  });
  it("no extraction writes canonical records; investors/managers get no Drive access", () => {
    expect(s).not.toMatch(/from\("(investment_profiles|profiles|investor_onboardings|offerings)"\)\.(update|insert)/);
    expect(s).not.toMatch(/webViewLink|folderUrl/);
  });
});
