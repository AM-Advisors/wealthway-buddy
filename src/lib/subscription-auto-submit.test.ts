import { describe, expect, it } from "vitest";
import { autoSubmitSigner, lastSignedAt, shouldAutoSubmitSubscription } from "@/lib/subscription-auto-submit";

const signed = [{ key: "signature", state: "valid" }] as any;
const unsigned = [{ key: "signature", state: "missing" }] as any;
const base = { stage: "harmonious_review", removed: false, executed: false, blockingExceptions: 0, confirmedSignatures: 2 };

describe("automatic Submit subscription", () => {
  it("submits once the signing service confirms every investor signature", () => {
    expect(shouldAutoSubmitSubscription({ ...base, requirements: signed })).toBe(true);
    expect(shouldAutoSubmitSubscription({ ...base, stage: "awaiting_funds", requirements: signed })).toBe(true);
  });
  it("leaves funded and imported earlier investments alone", () => {
    expect(shouldAutoSubmitSubscription({ ...base, stage: "funded", requirements: signed })).toBe(false);
    expect(shouldAutoSubmitSubscription({ ...base, confirmedSignatures: 0, requirements: signed })).toBe(false);
  });
  it("records when the investor actually signed", () => {
    expect(lastSignedAt([{ signed_at: "2026-11-23T21:21:00Z" }, { provider_completed_at: "2026-11-23T21:22:00Z" }])).toBe("2026-11-23T21:22:00.000Z");
  });
  it("submits when the investor signed everything and only the fund's countersignature is left", () => {
    const waitingFund = [{ key: "signature", state: "missing", awaitingCountersign: true }] as any;
    expect(shouldAutoSubmitSubscription({ ...base, stage: "signature", requirements: waitingFund })).toBe(true);
  });
  it("never submits before signatures are confirmed", () => {
    expect(shouldAutoSubmitSubscription({ ...base, stage: "signature", requirements: unsigned })).toBe(false);
  });
  it("never submits twice, for removed or closed investments, or with blocking issues", () => {
    expect(shouldAutoSubmitSubscription({ ...base, executed: true, requirements: signed })).toBe(false);
    expect(shouldAutoSubmitSubscription({ ...base, removed: true, requirements: signed })).toBe(false);
    expect(shouldAutoSubmitSubscription({ ...base, stage: "cancelled", requirements: signed })).toBe(false);
    expect(shouldAutoSubmitSubscription({ ...base, blockingExceptions: 1, requirements: signed })).toBe(false);
  });
  it("uses the name the signing service recorded, newest first", () => {
    expect(autoSubmitSigner({ isEntity: false, profileLegalName: "Christofer Par", signatures: [
      { signer_name: "Chris Par", signed_at: "2026-11-20T00:00:00Z" }, { signer_name: "Christofer Par", signer_capacity: null, signed_at: "2026-11-23T21:21:00Z" },
    ] })).toEqual({ signerName: "Christofer Par", capacity: null });
    expect(autoSubmitSigner({ isEntity: true, personName: "Jane Doe", signatures: [{ signer_name: "Jane Doe", signer_capacity: "Trustee", signed_at: "2026-11-23T00:00:00Z" }] })).toEqual({ signerName: "Jane Doe", capacity: "Trustee" });
  });
  it("falls back to the investor's legal name, never a company name as signer", () => {
    expect(autoSubmitSigner({ isEntity: false, profileLegalName: "Alyssa Pettit", signatures: [] })).toEqual({ signerName: "Alyssa Pettit", capacity: null });
    expect(autoSubmitSigner({ isEntity: true, profileLegalName: "Flockstead Trust", personName: null, signatures: [] })).toBeNull();
  });
});
