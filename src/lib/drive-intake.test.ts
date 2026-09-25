import { describe, expect, it } from "vitest";

import {
  RESTRICTED_EVIDENCE_MESSAGE,
  canUseDriveIntake,
  classificationWarning,
  contextConflict,
  executionEvidenceFor,
  prefillFromHierarchy,
  reviewStateFor,
  rowProblems,
  sourceProblem,
  type AssociationRow,
  type FileFacts,
} from "@/lib/drive-intake";
import { importOne, type DriveReadPort, type IntakeStore } from "@/lib/drive-intake-core";
import type { RepositoryConfig } from "@/lib/drive-policy";

const config: RepositoryConfig = {
  fund: { rootId: "FUNDROOT000", driveId: "FUNDDRIVE00" },
  investor: { rootId: "INVROOT0000", driveId: "INVDRIVE000" },
  test: { rootId: "QAROOT00000", driveId: "QADRIVE0000" },
};
const F1 = "11111111-1111-1111-1111-111111111111";
const F2 = "22222222-2222-2222-2222-222222222222";
const P1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const P2 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const mappings = [
  { id: "m1", folder_id: "FUNDF1", offering_id: F1, investment_profile_id: null, entity_kind: "fund" },
  { id: "m2", folder_id: "FUNDF2", offering_id: F2, investment_profile_id: null, entity_kind: "fund" },
  { id: "m3", folder_id: "INVP1", offering_id: F1, investment_profile_id: P1, entity_kind: "investor" },
  { id: "m4", folder_id: "INVP2", offering_id: F1, investment_profile_id: P2, entity_kind: "investor" },
];

const file = (over: Partial<FileFacts> = {}): FileFacts => ({
  id: "FILE000001", name: "LPA.pdf", mimeType: "application/pdf", driveId: "FUNDDRIVE00", ancestors: ["FUNDF1", "FUNDROOT000", "FUNDDRIVE00"], modifiedTime: "2024-01-01T00:00:00.000Z", md5Checksum: "md5a", ...over,
});
const fundRow = (over: Partial<AssociationRow> = {}): AssociationRow => ({
  driveFileId: "FILE000001", repository: "fund", offeringId: F1, category: "fund", documentType: "operating_agreement", classification: "fund_general", recordStatus: "historical", ...over,
});
const invRow = (over: Partial<AssociationRow> = {}): AssociationRow => ({
  driveFileId: "FILE000002", repository: "investor", offeringId: F1, profileId: P1, category: "investor", documentType: "executed_subscription_agreement", classification: "investor_restricted", recordStatus: "historical", ...over,
});

function harness(files: Record<string, FileFacts>, bytes: Record<string, string> = {}) {
  const docs: any[] = [];
  const assoc: any[] = [];
  const events: string[] = [];
  const stored = new Map<string, Uint8Array>();
  const driveCalls: string[] = [];
  const drive: DriveReadPort = {
    async fileFacts(id) { driveCalls.push(`facts:${id}`); return files[id] ?? null; },
    async download(f) { driveCalls.push(`download:${f.id}`); return new TextEncoder().encode(bytes[f.id] ?? `bytes-${f.id}-${f.md5Checksum}`); },
  };
  const store: IntakeStore = {
    async priorImports() { return docs; },
    async mappings() { return mappings; },
    async investment(o, p) { return (o === F1 && (p === P1 || p === P2)) ? `ob-${p}` : null; },
    async putFile(path, b) { stored.set(path, b); },
    async insertDocument(row) { docs.push(row); return { id: row.id as string }; },
    async insertAssociation(row) { assoc.push(row); return "created"; },
    async hasAssociation(d, o, p) { return assoc.some((a) => a.document_id === d && a.offering_id === o && a.investment_profile_id === p); },
    async log(e) { events.push(e); },
  };
  let n = 0;
  const run = (req: any, env: "production" | "test" = "production") => importOne(req, { env, config, userId: "u1", drive, store, newId: () => `doc-${++n}` });
  return { docs, assoc, events, stored, driveCalls, run, files };
}

describe("Drive intake authorization", () => {
  it("only Super Administrators can import", () => {
    expect(canUseDriveIntake(["super_admin"])).toBe(true);
    expect(canUseDriveIntake(["admin", "operations"])).toBe(false);
  });
  it("Fund Managers and Investors cannot import", () => {
    expect(canUseDriveIntake(["fund_manager"])).toBe(false);
    expect(canUseDriveIntake(["investor"])).toBe(false);
    expect(canUseDriveIntake([])).toBe(false);
  });
});

describe("repository boundary", () => {
  it("rejects files outside approved roots, even in the same shared drive", () => {
    expect(sourceProblem(file({ ancestors: ["OTHER", "FUNDDRIVE00"] }), "fund", "production", config)).toMatch(/approved/);
    expect(sourceProblem(file({ driveId: "RANDOMDRIVE" }), "fund", "production", config)).toMatch(/approved/);
  });
  it("production cannot import from QA", () => {
    expect(sourceProblem(file({ driveId: "QADRIVE0000", ancestors: ["QAROOT00000"] }), "test", "production", config)).toMatch(/Production/);
    expect(sourceProblem(file({ driveId: "QADRIVE0000", ancestors: ["QAROOT00000"] }), "fund", "production", config)).toMatch(/approved/);
  });
  it("QA cannot import from production", () => {
    expect(sourceProblem(file(), "fund", "test", config)).toMatch(/QA/);
    expect(sourceProblem(file(), "test", "test", config)).toMatch(/approved/);
  });
  it("accepts a file inside the right root", () => {
    expect(sourceProblem(file(), "fund", "production", config)).toBeNull();
  });
});

describe("association rules", () => {
  it("filename alone never establishes identity — prefill comes only from tagged folders", () => {
    const pre = prefillFromHierarchy(["UNTAGGED", "FUNDROOT000"], mappings);
    expect(pre).toEqual({ mappingId: null, offeringId: null, profileId: null });
    expect(rowProblems(invRow({ profileId: null }), "Jane Smith subscription.pdf")).toContain("Choose the Investor / Investment Profile.");
  });
  it("preserves exact fund and profile context from the hierarchy", () => {
    expect(prefillFromHierarchy(["INVP1", "X"], mappings)).toMatchObject({ offeringId: F1, profileId: P1 });
    expect(prefillFromHierarchy(["FUNDF2"], mappings)).toMatchObject({ offeringId: F2, profileId: null });
  });
  it("same Person / different profiles never mix; cross-fund association is rejected", () => {
    expect(contextConflict(["INVP1"], mappings, F1, P2)).toMatch(/different investor profile/);
    expect(contextConflict(["FUNDF2"], mappings, F1, null)).toMatch(/another Fund/);
    expect(contextConflict(["INVP1"], mappings, F1, P1)).toBeNull();
  });
  it("broad-source relabelling needs acknowledgement", () => {
    expect(classificationWarning("investor_restricted", "fund")).toMatch(/relabelling does not make/);
    expect(rowProblems(fundRow({ category: "investor", profileId: P1, documentType: "side_letter", classification: "investor_restricted" }), "x.pdf")).toContain("Acknowledge the source-location warning.");
  });
  it("historical executed is distinct from Box-verified", () => {
    expect(executionEvidenceFor({ historicalExecuted: true, recordStatus: "historical" })).toBe("historical_executed");
    expect(executionEvidenceFor({ historicalExecuted: true, recordStatus: "active" })).toBe("none");
    expect(executionEvidenceFor({ historicalExecuted: true, recordStatus: "historical" })).not.toBe("box_verified");
  });
  it("accreditation import only queues review", () => {
    expect(reviewStateFor("investor", "accreditation_evidence")).toBe("evidence_received_needs_review");
  });
});

describe("importOne", () => {
  it("imports a fund document with provenance and never writes to Drive", async () => {
    const h = harness({ FILE000001: file() });
    const r = await h.run(fundRow());
    expect(r).toMatchObject({ ok: true, outcome: "imported" });
    expect(h.docs[0]).toMatchObject({ offering_id: F1, drive_file_id: "FILE000001", drive_id: "FUNDDRIVE00", source_repository: "fund", source_mapping_id: "m1", original_filename: "LPA.pdf", imported_by: "u1", execution_evidence: "none" });
    expect(h.driveCalls.every((c) => c.startsWith("facts:") || c.startsWith("download:"))).toBe(true);
  });
  it("prevents duplicate import", async () => {
    const h = harness({ FILE000001: file() });
    await h.run(fundRow());
    const again = await h.run(fundRow());
    expect(again).toMatchObject({ ok: false, outcome: "already_imported" });
    expect(h.stored.size).toBe(1);
    expect(h.events).toContain("duplicate_prevented");
  });
  it("identical bytes under a different Drive id are not stored twice", async () => {
    const h = harness({ FILE000001: file(), FILE000009: file({ id: "FILE000009", md5Checksum: "other" }) }, { FILE000001: "same", FILE000009: "same" });
    await h.run(fundRow());
    const r = await h.run(fundRow({ driveFileId: "FILE000009" }));
    expect(r.ok).toBe(false);
    expect(h.stored.size).toBe(1);
  });
  it("a changed Drive file becomes an explicit new version, never a silent overwrite", async () => {
    const h = harness({ FILE000001: file() });
    await h.run(fundRow());
    h.files.FILE000001 = file({ md5Checksum: "md5b", modifiedTime: "2025-01-01T00:00:00.000Z" });
    const blocked = await h.run(fundRow());
    expect(blocked).toMatchObject({ ok: false, outcome: "changed_source" });
    const v2 = await h.run({ ...fundRow(), importAsNewVersion: true });
    expect(v2).toMatchObject({ ok: true, outcome: "new_version" });
    expect(h.docs.map((d) => d.version_number)).toEqual([1, 2]);
    expect(h.docs[1].previous_version_id).toBe(h.docs[0].id);
    expect(h.stored.size).toBe(2);
  });
  it("imported copy remains if the Drive source disappears", async () => {
    const h = harness({ FILE000001: file() });
    await h.run(fundRow());
    delete h.files.FILE000001;
    const r = await h.run(fundRow());
    expect(r).toMatchObject({ ok: false, outcome: "unavailable" });
    expect(h.stored.size).toBe(1);
    expect(h.docs).toHaveLength(1);
  });
  it("rejects restricted tax/KYC evidence", async () => {
    for (const name of ["W-9 Smith.pdf", "Passport scan.jpg", "KYC report.pdf", "Didit export.pdf", "OFAC sanctions hit.pdf"]) {
      const h = harness({ FILE000001: file({ name }) });
      const r = await h.run(fundRow());
      expect(r).toMatchObject({ ok: false, outcome: "restricted_evidence", message: RESTRICTED_EVIDENCE_MESSAGE });
      expect(h.stored.size).toBe(0);
    }
  });
  it("accreditation import does not approve accreditation; compliance import does not pass compliance", async () => {
    const h = harness({ FILE000002: file({ id: "FILE000002", name: "Accreditation letter.pdf", driveId: "INVDRIVE000", ancestors: ["INVP1", "INVROOT0000"] }) });
    await h.run(invRow({ documentType: "accreditation_evidence" }));
    expect(h.docs[0].review_state).toBe("evidence_received_needs_review");
    expect(Object.keys(h.docs[0])).not.toContain("accreditation_status");
    expect(Object.keys(h.docs[0]).some((k) => /kyc|aml|compliance_status/.test(k))).toBe(false);
  });
  it("rejects cross-fund and cross-profile association attacks", async () => {
    const h = harness({ FILE000002: file({ id: "FILE000002", driveId: "INVDRIVE000", ancestors: ["INVP1", "INVROOT0000"] }) });
    expect(await h.run(invRow({ profileId: P2 }))).toMatchObject({ ok: false, outcome: "rejected" });
    expect(await h.run(invRow({ offeringId: F2 }))).toMatchObject({ ok: false });
    const outsider = harness({ FILE000002: file({ id: "FILE000002", driveId: "INVDRIVE000", ancestors: ["INVROOT0000"] }) });
    expect(await outsider.run(invRow({ profileId: "cccccccc-cccc-cccc-cccc-cccccccccccc" }))).toMatchObject({ ok: false, message: expect.stringMatching(/no investment/) });
  });
  it("one bad row does not affect others", async () => {
    const h = harness({ FILE000001: file(), FILE000003: file({ id: "FILE000003", name: "W-8BEN.pdf" }) });
    const results = [await h.run(fundRow({ driveFileId: "FILE000003" })), await h.run(fundRow())];
    expect(results.map((r) => r.ok)).toEqual([false, true]);
  });
  it("QA context refuses production files", async () => {
    const h = harness({ FILE000001: file() });
    expect(await h.run(fundRow(), "test")).toMatchObject({ ok: false });
  });
});
