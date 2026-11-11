/**
 * Fictional, in-memory sign-in service for the QA sandbox security-gate check.
 * Never calls the real backend. The fictional valid code is QA_MFA_CODE.
 */
import type { GateAuth } from "@/lib/mfa-stage";

export const QA_MFA_CODE = "246810";
export type QaMfaScenario = "enrolled_stale" | "unenrolled" | "lookup_outage" | "lookup_down";

export function createQaMfaAuth(scenario: QaMfaScenario) {
  let level: "aal1" | "aal2" = "aal1";
  const factors: { id: string; factor_type: string; status: string }[] =
    scenario === "unenrolled" ? [] : [{ id: "qa-totp", factor_type: "totp", status: "verified" }];
  let lookupDown = scenario === "lookup_outage" || scenario === "lookup_down";
  const ok = <T,>(data: T) => Promise.resolve({ data, error: null });
  const fail = (message: string) => Promise.resolve({ data: null, error: { message } });
  const auth: GateAuth = {
    mfa: {
      // Mimics a stale browser session copy: it never knows about enrolled factors.
      getAuthenticatorAssuranceLevel: () => ok({ currentLevel: level, nextLevel: level }),
      listFactors: () => {
        if (lookupDown) {
          return fail("Sign-in service unavailable (fictional)");
        }
        return ok({ all: factors.map((f) => ({ ...f })) });
      },
      enroll: () => {
        factors.push({ id: "qa-new-totp", factor_type: "totp", status: "unverified" });
        return ok({ id: "qa-new-totp", totp: { qr_code: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10'/%3E", secret: "QAFICTIONALSECRET" } });
      },
      challengeAndVerify: ({ factorId, code }) => {
        const f = factors.find((x) => x.id === factorId);
        if (!f || code !== QA_MFA_CODE) return fail("Invalid code");
        f.status = "verified";
        level = "aal2";
        return ok({});
      },
    },
    refreshSession: () => Promise.resolve({}),
  };
  /** Ends a fictional outage (only for "lookup_outage"). */
  const restore = () => { if (scenario === "lookup_outage") lookupDown = false; };
  return { auth, restore, level: () => level, factors: () => factors.map((f) => ({ ...f })) };
}
