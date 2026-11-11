import { describe, expect, it } from "vitest";
import { mfaStage } from "./mfa-stage";

describe("mfaStage", () => {
  it("enrolled authenticator without a completed second step asks for the code, not setup", () => {
    expect(mfaStage({ currentLevel: "aal1", verifiedFactorCount: 1 })).toBe("verify");
    expect(mfaStage({ currentLevel: null, verifiedFactorCount: 1 })).toBe("verify");
  });
  it("account with no authenticator is sent to setup", () => {
    expect(mfaStage({ currentLevel: "aal1", verifiedFactorCount: 0 })).toBe("setup");
  });
  it("completed second step lets the user in", () => {
    expect(mfaStage({ currentLevel: "aal2", verifiedFactorCount: 1 })).toBe("ok");
  });
  it("unreadable factors never skip the second step or offer a second enrollment", () => {
    expect(mfaStage({ currentLevel: "aal1", verifiedFactorCount: null })).toBe("verify");
  });
});
