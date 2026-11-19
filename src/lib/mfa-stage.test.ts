import { describe, expect, it } from "vitest";
import { mfaStage, resolveGateStage } from "./mfa-stage";
import { createQaMfaAuth, QA_MFA_CODE } from "./qa-sandbox/mfa-fixture";

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
  it("unreadable factors show a retryable error: never let in, never offer enrollment", () => {
    expect(mfaStage({ currentLevel: "aal1", verifiedFactorCount: null })).toBe("error");
    expect(mfaStage({ currentLevel: "aal2", verifiedFactorCount: null })).toBe("error");
  });
});

describe("resolveGateStage with the fictional sign-in service", () => {
  it("stale session copy (no factors in it) still gets the code screen for an enrolled user", async () => {
    expect(await resolveGateStage(createQaMfaAuth("enrolled_stale").auth)).toBe("verify");
  });
  it("unenrolled user gets setup and is let in only after a correct code", async () => {
    const qa = createQaMfaAuth("unenrolled");
    expect(await resolveGateStage(qa.auth)).toBe("setup");
    const { data } = await qa.auth.mfa.enroll({ factorType: "totp" });
    expect((await qa.auth.mfa.challengeAndVerify({ factorId: data!.id, code: "000000" })).error).toBeTruthy();
    expect(await resolveGateStage(qa.auth)).toBe("setup");
    expect((await qa.auth.mfa.challengeAndVerify({ factorId: data!.id, code: QA_MFA_CODE })).error).toBeNull();
    expect(await resolveGateStage(qa.auth)).toBe("ok");
  });
  it("invalid code keeps an enrolled user blocked; valid code lets them in", async () => {
    const qa = createQaMfaAuth("enrolled_stale");
    await qa.auth.mfa.challengeAndVerify({ factorId: "qa-totp", code: "111111" });
    expect(await resolveGateStage(qa.auth)).toBe("verify");
    await qa.auth.mfa.challengeAndVerify({ factorId: "qa-totp", code: QA_MFA_CODE });
    expect(await resolveGateStage(qa.auth)).toBe("ok");
  });
  it("failed lookup shows error, then retry after recovery returns to the code screen", async () => {
    const qa = createQaMfaAuth("lookup_outage");
    expect(await resolveGateStage(qa.auth)).toBe("error");
    expect(await resolveGateStage(qa.auth)).toBe("error");
    qa.restore();
    expect(await resolveGateStage(qa.auth)).toBe("verify");
  });
  it("lookup that keeps failing never reaches ok or setup", async () => {
    const qa = createQaMfaAuth("lookup_down");
    for (let i = 0; i < 3; i++) expect(await resolveGateStage(qa.auth)).toBe("error");
  });
  it("thrown lookup is treated as error", async () => {
    const qa = createQaMfaAuth("enrolled_stale");
    qa.auth.mfa.listFactors = () => Promise.reject(new Error("network"));
    expect(await resolveGateStage(qa.auth)).toBe("error");
  });
});

describe("early security check head start", () => {
  // A sign-in service that counts lookups and can be switched from aal2 to aal1.
  function countingAuth(level: { current: string }) {
    const calls = { n: 0 };
    const auth = {
      mfa: {
        getAuthenticatorAssuranceLevel: async () => { calls.n += 1; return { data: { currentLevel: level.current, nextLevel: "aal2" }, error: null }; },
        listFactors: async () => ({ data: { all: [{ id: "f1", factor_type: "totp", status: "verified" }] }, error: null }),
      },
    } as unknown as import("./mfa-stage").GateAuth;
    return { auth, calls };
  }

  it("is reused once for the exact same session, without a second lookup", async () => {
    const { primeGateStage, takeGateStage } = await import("./mfa-stage");
    const { auth, calls } = countingAuth({ current: "aal2" });
    primeGateStage(auth, "token-a");
    expect(await takeGateStage(auth, "token-a")).toBe("ok");
    expect(calls.n).toBe(1);
  });

  it("a different session (new sign-in) never inherits an earlier completed second step", async () => {
    const { primeGateStage, takeGateStage } = await import("./mfa-stage");
    const level = { current: "aal2" };
    const { auth } = countingAuth(level);
    primeGateStage(auth, "old-session");
    level.current = "aal1";
    expect(await takeGateStage(auth, "new-session")).toBe("verify");
  });

  it("is used only once; the next check asks the sign-in service again", async () => {
    const { primeGateStage, takeGateStage } = await import("./mfa-stage");
    const level = { current: "aal2" };
    const { auth } = countingAuth(level);
    primeGateStage(auth, "token-b");
    await takeGateStage(auth, "token-b");
    level.current = "aal1";
    expect(await takeGateStage(auth, "token-b")).toBe("verify");
  });

  it("is not started while a security gate is already on screen", async () => {
    const { primeGateStage, noteGateShown } = await import("./mfa-stage");
    const { auth, calls } = countingAuth({ current: "aal2" });
    const done = noteGateShown();
    primeGateStage(auth, "token-c");
    done();
    expect(calls.n).toBe(0);
  });
});
