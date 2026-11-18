import { describe, expect, it } from "vitest";
import { classifyFileName, matchFolder, rowStatus } from "./fund-drive-intake-model";

const roster = [
  { onboardingId: "travis", names: ["Travis Roberts"] },
  { onboardingId: "aic", names: ["Advanced Investment Corporation"] },
  { onboardingId: "uget", names: ["Uget Ventures, LP"] },
];

describe("fund drive intake", () => {
  it("subscription and operating agreements go to signed outside", () => {
    expect(classifyFileName("4d_phantom_space_spv_2_-_subscription_agreement__1_ - signed - Travis.pdf")).toBe("subscription_agreement");
    expect(classifyFileName("4d_phantom_space_spv_2_-_operating_agreement_Travis Roberts - signed.pdf")).toBe("operating_agreement");
    expect(classifyFileName("2025_TRAVIS ROBERTS_4D PHANTOM SPACE SPV 2 A SERIES OF_K-1.pdf")).toBe("schedule_k1");
  });
  it("unknown names need Ops review", () => {
    expect(classifyFileName("2026-08-11_21_19_12.pdf")).toBeNull();
    expect(rowStatus({ onboardingId: "travis", target: null, decision: null, readable: true })).toBe("review");
  });
  it("matches person and entity folders", () => {
    expect(matchFolder("Travis Roberts", roster)).toBe("travis");
    expect(matchFolder("Andrew Weiss-Malik (Uget Ventures, LP)", roster)).toBe("uget");
    expect(matchFolder("Someone Else", roster)).toBeNull();
    expect(matchFolder("Travis Robrets", roster)).toBe("travis");
    expect(matchFolder("John Hastings (Hastings Interests LP)", [{ onboardingId: "h", names: ["Hastings Intrests LP"] }])).toBe("h");
  });
  it("rejected rows stay rejected", () => {
    expect(rowStatus({ onboardingId: "travis", target: "other", decision: "rejected", readable: true })).toBe("rejected");
  });
});

import { draftFromFolder } from "./fund-drive-intake-model";
describe("new investor from a Drive folder", () => {
  it("reads a person and their trust", () => {
    expect(draftFromFolder("Charles Steinmetz (Charles P Steinmetz Rev Trust)")).toEqual({ type: "trust", firstName: "Charles", lastName: "Steinmetz", legalName: "Charles P Steinmetz Rev Trust", email: "" });
  });
  it("reads an individual", () => {
    expect(draftFromFolder("Jody Papini")).toMatchObject({ type: "individual", firstName: "Jody", lastName: "Papini", legalName: "" });
  });
  it("reads an entity named outside the brackets", () => {
    expect(draftFromFolder("Advanced Investment Corp (Benjamin Bassichis)")).toMatchObject({ type: "entity", firstName: "Benjamin", lastName: "Bassichis", legalName: "Advanced Investment Corp" });
  });
  it("reads an entity-only folder and leaves the signer blank", () => {
    expect(draftFromFolder("P4L2 Holdings LLC")).toMatchObject({ type: "entity", firstName: "", legalName: "P4L2 Holdings LLC" });
  });
});
