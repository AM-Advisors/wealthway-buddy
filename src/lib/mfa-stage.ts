/**
 * Decides which second-step screen the security gate shows.
 * Verified factors come from the sign-in service (listFactors → getUser), never the cached
 * browser session copy, which can be stale (restored or refreshed sessions without `factors`).
 * A verified factor always leads to "verify"; enrollment is offered only when the service
 * confirms there is none. If factors cannot be read, the gate shows a retryable error:
 * it never lets the user in and never offers a second enrollment.
 */
export type MfaStage = "setup" | "verify" | "error" | "ok";

export function mfaStage(input: {
  currentLevel: string | null | undefined;
  verifiedFactorCount: number | null; // null = could not read factors from the service
}): MfaStage {
  if (input.verifiedFactorCount === null) return "error";
  if (input.currentLevel === "aal2") return "ok";
  return input.verifiedFactorCount > 0 ? "verify" : "setup";
}

type Res<T> = Promise<{ data: T | null; error: unknown }>;

/** The parts of the sign-in client the gate uses; the QA sandbox supplies a fictional one. */
export interface GateAuth {
  mfa: {
    getAuthenticatorAssuranceLevel(): Res<{ currentLevel: string | null; nextLevel: string | null }>;
    listFactors(): Res<{ all: { id: string; factor_type: string; status: string; friendly_name?: string | null }[] }>;
    enroll(p: { factorType: "totp"; issuer?: string; friendlyName?: string }): Res<{ id: string; totp: { qr_code: string; secret: string } }>;
    challengeAndVerify(p: { factorId: string; code: string }): Res<unknown>;
    webauthn?: {
      register(p: { friendlyName: string }): Res<unknown>;
      authenticate(p: { factorId: string }): Res<unknown>;
    };
  };
  refreshSession(): Promise<unknown>;
}

export async function resolveGateStage(auth: GateAuth): Promise<MfaStage> {
  try {
    const { data } = await auth.mfa.getAuthenticatorAssuranceLevel();
    const { data: f, error } = await auth.mfa.listFactors();
    const verified = error || !f ? null : f.all.filter((x) => x.status === "verified").length;
    return mfaStage({ currentLevel: data?.currentLevel, verifiedFactorCount: verified });
  } catch {
    return "error";
  }
}

/**
 * Lets the signed-in layout start the security check while the page code is
 * still downloading. The gate takes the head start once, only for the same
 * sign-in service and the exact same session token (a new sign-in, refresh or
 * second step changes the token), and otherwise asks again. The decision
 * itself is unchanged.
 */
let primed: { auth: GateAuth; key: string; at: number; stage: Promise<MfaStage> } | null = null;
let gatesShown = 0;
const PRIMED_FOR_MS = 30_000;

export function primeGateStage(auth: GateAuth, key: string | null | undefined): void {
  // A gate on screen already holds its decision; nothing to start early.
  if (!key || gatesShown > 0) return;
  if (primed && primed.auth === auth && primed.key === key && Date.now() - primed.at < PRIMED_FOR_MS) return;
  primed = { auth, key, at: Date.now(), stage: resolveGateStage(auth) };
}

export function takeGateStage(auth: GateAuth, key: string | null | undefined): Promise<MfaStage> {
  const hit = primed && key && primed.auth === auth && primed.key === key && Date.now() - primed.at < PRIMED_FOR_MS ? primed.stage : null;
  primed = null;
  return hit ?? resolveGateStage(auth);
}

/** The security gate reports while it is on screen; returns the cleanup. */
export function noteGateShown(): () => void {
  gatesShown += 1;
  return () => { gatesShown = Math.max(0, gatesShown - 1); };
}
