import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  acknowledgmentsComplete,
  documentApplies,
  documentObligations,
  executionState,
  investorDocumentAction,
  investorSignerRoles,
  offeringDocumentsSetupStatus,
  requiresCountersignature,
  signingConfigErrors,
  signingStatusForNewVersion,
  versionChangeImpact,
  versionState,
} from "./offering-document-model";

const server = readFileSync("src/lib/offering-document-setup.server.ts", "utf8");
const ui = readFileSync("src/components/offering-documents-setup.tsx", "utf8");

describe("offering documents — versions and approval", () => {
  it("uploads create new versions and never overwrite", () => {
    expect(server).toMatch(/version = Number\(latest\?\.version \?\? 0\) \+ 1/);
    expect(server).not.toMatch(/offering_document_versions"\)\.delete/);
  });
  it("uploaded is not approved; approved without usage is only approved", () => {
    expect(versionState({ approval: "uploaded_review_required", usage: "signature", signingStatus: "confirmed" })).toBe("uploaded_review_required");
    expect(versionState({ approval: "approved", usage: null, signingStatus: "not_configured" })).toBe("approved_for_use");
  });
  it("reference and acknowledgment are ready once approved; signature needs confirmed setup", () => {
    expect(versionState({ approval: "approved", usage: "reference", signingStatus: "not_configured" })).toBe("ready_for_use");
    expect(versionState({ approval: "approved", usage: "acknowledgment", signingStatus: "not_configured" })).toBe("ready_for_use");
    expect(versionState({ approval: "approved", usage: "signature", signingStatus: "not_configured" })).toBe("signing_setup_required");
    expect(versionState({ approval: "approved", usage: "signature", signingStatus: "confirmed" })).toBe("ready_for_use");
  });
  it("a new version requires signing-setup review rather than copying readiness", () => {
    expect(signingStatusForNewVersion({ signers: [{ role: "investor", fields: ["signature"], order: 1 }] })).toBe("needs_review");
    expect(signingStatusForNewVersion(null)).toBe("not_configured");
    expect(server).toMatch(/signing_config: null/);
  });
  it("superseded versions stay superseded", () => {
    expect(versionState({ approval: "superseded", usage: "signature", signingStatus: "confirmed" })).toBe("superseded");
  });
  it("Generate from Template is not exposed", () => {
    expect(ui).not.toMatch(/Generate from Template/i);
  });
});

describe("applicability", () => {
  it("by profile type and class; empty means all", () => {
    expect(documentApplies({}, { profileType: "llc", classKey: null })).toBe(true);
    expect(documentApplies({ profileTypes: ["individual"] }, { profileType: "llc", classKey: null })).toBe(false);
    expect(documentApplies({ classKeys: ["a"] }, { profileType: "llc", classKey: "b" })).toBe(false);
    expect(documentApplies({ classKeys: ["a"] }, { profileType: "llc", classKey: "a" })).toBe(true);
  });
});

describe("signers", () => {
  it("fund signatory countersign requires a chosen Fund Signatory", () => {
    const cfg = { signers: [{ role: "fund_signatory" as const, fields: ["signature" as const], order: 1 }] };
    expect(signingConfigErrors(cfg, { hasFundSignatory: false })).toHaveLength(1);
    expect(signingConfigErrors(cfg, { hasFundSignatory: true })).toHaveLength(0);
    expect(requiresCountersignature(cfg)).toBe(true);
  });
  it("each signer needs a signature or initials", () => {
    expect(signingConfigErrors({ signers: [{ role: "investor", fields: ["title"], order: 1 }] }, { hasFundSignatory: false }).length).toBe(1);
  });
  it("entity signers are explicit authorized signers; beneficial owners never sign by ownership", () => {
    const r = investorSignerRoles("llc", [
      { role: "beneficial_owner", personId: "bo" },
      { role: "authorized_signer", personId: "as" },
    ]);
    expect(r[0]!.role).toBe("entity_authorized_signer");
    expect(r[0]!.personIds).toEqual(["as"]);
  });
  it("joint and trust signers", () => {
    expect(investorSignerRoles("joint", [{ role: "joint_owner", personId: "j" }]).map((x) => x.role)).toEqual(["investor", "joint_investor"]);
    expect(investorSignerRoles("revocable_trust", [{ role: "trustee", personId: "t" }])[0]!.personIds).toEqual(["t"]);
  });
});

describe("execution", () => {
  it("sent is not signed; partial is not executed; investor-signed awaits countersignature", () => {
    expect(executionState([{ role: "investor", status: "sent" }])).toBe("sent");
    expect(executionState([{ role: "investor", status: "signed" }, { role: "joint_investor", status: "sent" }])).toBe("partially_signed");
    expect(executionState([{ role: "investor", status: "signed" }, { role: "fund_signatory", status: "sent" }])).toBe("awaiting_countersignature");
    expect(executionState([{ role: "investor", status: "signed" }, { role: "fund_signatory", status: "signed" }])).toBe("fully_executed");
  });
  it("acknowledgment never becomes a signature; reference never needs either", () => {
    const docs = [
      { id: "ppm", usage: "reference" as const, legacyRequiresSignature: true, activeVersion: 1 },
      { id: "oa", usage: "acknowledgment" as const, legacyRequiresSignature: false, activeVersion: 2 },
      { id: "sub", usage: "signature" as const, legacyRequiresSignature: false, activeVersion: 1 },
    ];
    const o = documentObligations(docs);
    expect(o.needsSignature.map((d) => d.id)).toEqual(["sub"]);
    expect(o.needsAck.map((d) => d.id)).toEqual(["oa"]);
    expect(acknowledgmentsComplete(o.needsAck, [{ documentId: "oa", version: 1 }])).toBe(false);
    expect(acknowledgmentsComplete(o.needsAck, [{ documentId: "oa", version: 2 }])).toBe(true);
  });
  it("investor actions use plain language", () => {
    expect(investorDocumentAction({ usage: "reference", legacyRequiresSignature: false, acknowledged: false, execution: "not_sent" })).toBe("Review");
    expect(investorDocumentAction({ usage: "signature", legacyRequiresSignature: false, acknowledged: false, execution: "sent" })).toBe("Continue Signing");
    expect(investorDocumentAction({ usage: "signature", legacyRequiresSignature: false, acknowledged: false, execution: "fully_executed" })).toBe("Completed");
  });
  it("executed investments keep their version; impact counts but changes nothing", () => {
    const r = versionChangeImpact(
      [
        { executedVersion: 1, execution: "fully_executed", profileType: "individual", classKey: "a" },
        { executedVersion: 1, execution: "sent", profileType: "llc", classKey: null },
        { executedVersion: null, execution: "not_sent", profileType: null, classKey: null },
      ],
      1,
    );
    expect(r).toMatchObject({ executedOldVersion: 1, awaitingSignature: 1, notYetSent: 1 });
    expect(server).not.toMatch(/document_signatures"\)\.update/);
  });
});

describe("setup status and access", () => {
  it("setup status never depends on investor execution", () => {
    expect(offeringDocumentsSetupStatus([]).status).toBe("not_started");
    expect(offeringDocumentsSetupStatus([{ category: "subscription_agreement", usage: "signature", activeState: "ready_for_use", latestState: "ready_for_use" }]).status).toBe("complete");
    expect(offeringDocumentsSetupStatus([{ category: "ppm", usage: null, activeState: null, latestState: "uploaded_review_required" }]).status).toBe("in_progress");
  });
  it("configuration is Harmonious-only; managers read only their fund; investors only their own investment", () => {
    for (const fn of ["createSetupDocument", "uploadDocumentVersion", "approveDocumentVersion", "setDocumentUsage", "saveSigningConfig", "activateDocumentVersion", "previewVersionImpact"]) {
      const body = server.slice(server.indexOf(`export async function ${fn}`));
      expect(body.slice(0, 400)).toMatch(/assertStaff\(/);
    }
    expect(server).toMatch(/!a\.isStaff && !a\.offeringIds\.includes\(offeringId\)/);
    expect(server).toMatch(/row\.investor_user_id !== userId/);
    expect(server).toMatch(/d\.offering_id !== row\.offering_id/);
  });
});
