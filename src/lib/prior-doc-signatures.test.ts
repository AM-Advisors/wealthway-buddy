import { describe, expect, it } from "vitest";
import { evaluateSignatures, needsSignatureCheck, waitingLabel } from "./prior-doc-signatures";

const both = [{ role: "investor" as const, name: "Todd Floyd" }, { role: "fund_manager" as const, name: "Thomas Morgan Jr." }];

describe("loaded document signatures", () => {
  it("all signatures found is complete", () => {
    expect(evaluateSignatures({ expected: both, read: { investorSigned: true, fundSigned: true, confidence: "high" } }).state).toBe("complete");
  });
  it("missing countersignature waits on the fund manager only", () => {
    const r = evaluateSignatures({ expected: both, read: { investorSigned: true, fundSigned: false, confidence: "high" } });
    expect(r.state).toBe("waiting");
    expect(r.missing.map((m) => m.role)).toEqual(["fund_manager"]);
    expect(waitingLabel(r.missing)).toBe("Waiting on Thomas Morgan Jr. (fund countersignature)");
  });
  it("unsure read needs a person to check", () => {
    expect(evaluateSignatures({ expected: both, read: { investorSigned: true, fundSigned: false, confidence: "low" } }).state).toBe("needs_check");
    expect(evaluateSignatures({ expected: both, read: null }).state).toBe("needs_check");
  });
  it("platform signature for the missing party completes it", () => {
    expect(evaluateSignatures({ expected: both, read: { investorSigned: true, fundSigned: false, confidence: "high" }, platformSigned: ["fund_manager"] }).state).toBe("complete");
  });
  it("person confirmation completes it", () => {
    expect(evaluateSignatures({ expected: both, read: null, confirmedComplete: true }).state).toBe("complete");
  });
  it("K-1s and statements are not signature-checked", () => {
    expect(needsSignatureCheck("schedule_k1")).toBe(false);
    expect(needsSignatureCheck("subscription_agreement")).toBe(true);
  });
});
