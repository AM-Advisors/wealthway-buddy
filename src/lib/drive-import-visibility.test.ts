import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  audienceFor,
  currentVersions,
  executionLabel,
  presentImport,
  showDriveImportTab,
  versionHistory,
  visibleImports,
  type ImportedDoc,
  type Viewer,
} from "@/lib/drive-import-visibility";
import { isRestrictedEvidence, reviewStateFor, executionEvidenceFor } from "@/lib/drive-intake";

const FA = "fund-a", FB = "fund-b";
let n = 0;
function doc(p: Partial<ImportedDoc>): ImportedDoc {
  return {
    id: `d${++n}`, offering_id: FA, investment_profile_id: null, category: "fund", document_type: "formation",
    classification: "fund_general", record_status: "current", execution_evidence: "none", review_state: "not_applicable",
    version_number: 1, previous_version_id: null, original_filename: "Certificate.pdf", imported_at: "2026-09-01", imported_by: "u-admin", ...p,
  };
}
const staff: Viewer = { roles: ["operations"], managedOfferingIds: [], ownInvestments: [] };
const managerA: Viewer = { roles: ["fund_manager"], managedOfferingIds: [FA], ownInvestments: [] };
const managerB: Viewer = { roles: ["fund_manager"], managedOfferingIds: [FB], ownInvestments: [] };
// Same person, two profiles in fund A.
const investorA: Viewer = { roles: ["investor"], managedOfferingIds: [], ownInvestments: [{ offeringId: FA, profileId: "p-ind" }] };
const investorALlc: Viewer = { roles: ["investor"], managedOfferingIds: [], ownInvestments: [{ offeringId: FA, profileId: "p-llc" }] };
const investorB: Viewer = { roles: ["investor"], managedOfferingIds: [], ownInvestments: [{ offeringId: FA, profileId: "p-b" }] };

describe("Drive import tab", () => {
  it("shows only to Super Administrators", () => {
    expect(showDriveImportTab(["super_admin"])).toBe(true);
    expect(showDriveImportTab(["admin"])).toBe(false);
    expect(showDriveImportTab(["operations"])).toBe(false);
    expect(showDriveImportTab(["tax", "compliance"])).toBe(false);
  });
  it("is gated in the Operations page and every import call is still refused on the server", () => {
    const page = readFileSync("src/routes/_authenticated/ops.documents.tsx", "utf8");
    expect(page).toMatch(/canImport \? <TabsTrigger value="drive-import"/);
    const fns = readFileSync("src/lib/drive-intake.functions.ts", "utf8");
    for (const name of ["browseDrive", "importDriveFiles", "openDriveImport"]) {
      const body = fns.slice(fns.indexOf(`export const ${name}`)).split("export const ")[1];
      expect(body, name).toMatch(/requireSuperAdmin/);
    }
  });
});

describe("canonical document visibility", () => {
  it("Fund General appears for the manager of that fund and staff", () => {
    const d = doc({});
    expect(audienceFor(managerA, d)).toBe("manager");
    expect(audienceFor(staff, d)).toBe("staff");
    expect(audienceFor(investorA, d)).toBe("investor");
  });
  it("Fund Manager A cannot see Fund B imports", () => {
    expect(audienceFor(managerA, doc({ offering_id: FB }))).toBeNull();
    expect(audienceFor(managerB, doc({}))).toBeNull();
  });
  it("investors don't see banking, filings or tax fund documents", () => {
    for (const t of ["banking", "regulatory_filing", "tax_deliverable"]) expect(audienceFor(investorA, doc({ document_type: t }))).toBeNull();
  });
  it("Investor General only reaches the exact profile and its fund's manager", () => {
    const d = doc({ category: "investor", classification: "investor_general", document_type: "investor_correspondence", investment_profile_id: "p-ind" });
    expect(audienceFor(investorA, d)).toBe("investor");
    expect(audienceFor(managerA, d)).toBe("manager");
    expect(audienceFor(investorB, d)).toBeNull();
    expect(audienceFor(managerB, d)).toBeNull();
  });
  it("same person's Individual and LLC profiles stay separate", () => {
    const d = doc({ category: "investor", classification: "investor_restricted", document_type: "executed_subscription_agreement", investment_profile_id: "p-llc" });
    expect(audienceFor(investorALlc, d)).toBe("investor");
    expect(audienceFor(investorA, d)).toBeNull();
  });
  it("Investor Restricted never reaches managers; owners see only their own agreements", () => {
    const sub = doc({ category: "investor", classification: "investor_restricted", document_type: "subscription_agreement", investment_profile_id: "p-ind" });
    expect(audienceFor(managerA, sub)).toBeNull();
    expect(audienceFor(investorA, sub)).toBe("investor");
    expect(audienceFor(investorA, { ...sub, document_type: "other_investor" })).toBeNull();
  });
  it("Harmonious Restricted stays Harmonious-only", () => {
    const d = doc({ classification: "harmonious_restricted" });
    expect(audienceFor(staff, d)).toBe("staff");
    for (const v of [managerA, investorA]) expect(audienceFor(v, d)).toBeNull();
  });
  it("accreditation evidence never reaches managers and enters Needs Review", () => {
    const d = doc({ category: "investor", classification: "investor_general", document_type: "accreditation_evidence", investment_profile_id: "p-ind", review_state: reviewStateFor("investor", "accreditation_evidence") });
    expect(audienceFor(managerA, d)).toBeNull();
    expect(presentImport(d, "staff", [d], "Accreditation evidence").review).toBe("Evidence received — needs review");
  });
  it("tax/KYC evidence is still refused by the importer", () => {
    expect(isRestrictedEvidence("W-9 Smith.pdf")).toBe(true);
    expect(isRestrictedEvidence("Passport scan.pdf")).toBe(true);
  });
});

describe("presentation, versions and search", () => {
  it("historical executed stays distinct from Box-verified", () => {
    expect(executionLabel(executionEvidenceFor({ historicalExecuted: true, recordStatus: "historical" }))).toBe("Historical Executed — Administrator Attestation");
    expect(executionLabel("box_verified")).toBeNull();
  });
  it("only staff receive Drive provenance", () => {
    const d = doc({});
    expect(presentImport(d, "staff", [d], "x").source?.label).toBe("Google Drive");
    expect(presentImport(d, "manager", [d], "x").source).toBeUndefined();
    expect(presentImport(d, "investor", [d], "x").source).toBeUndefined();
  });
  it("a new Drive version is shown as the newest version, history kept", () => {
    const v1 = doc({ id: "v1" });
    const v2 = doc({ id: "v2", previous_version_id: "v1", version_number: 2 });
    expect(currentVersions([v1, v2]).map((d) => d.id)).toEqual(["v2"]);
    expect(versionHistory([v1, v2], "v2").map((d) => d.id)).toEqual(["v1", "v2"]);
  });
  it("search applies the same authorization as lists", () => {
    const mine = doc({ original_filename: "Side letter.pdf", category: "investor", classification: "investor_restricted", document_type: "side_letter", investment_profile_id: "p-ind" });
    const theirs = { ...mine, id: "other", investment_profile_id: "p-b" };
    expect(visibleImports(investorA, [mine, theirs], { search: "side" }).map((x) => x.doc.id)).toEqual([mine.id]);
    expect(visibleImports(managerA, [mine, theirs], { search: "side" })).toEqual([]);
  });
  it("archived copies leave client views", () => {
    expect(audienceFor(managerA, doc({ record_status: "archived" }))).toBeNull();
  });
});
