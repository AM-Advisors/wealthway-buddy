/**
 * Decides which second-step screen the security gate shows.
 * Verified factors come from the sign-in service (listFactors → getUser), never the cached
 * browser session copy, which can be stale (restored or refreshed sessions without `factors`).
 * A verified factor always leads to "verify"; enrollment is offered only when the service
 * confirms there is none. Unknown state never skips the second step.
 */
export type MfaStage = "setup" | "verify" | "ok";

export function mfaStage(input: {
  currentLevel: string | null | undefined;
  verifiedFactorCount: number | null; // null = could not read factors from the service
}): MfaStage {
  if (input.currentLevel === "aal2") return "ok";
  if (input.verifiedFactorCount === null) return "verify";
  return input.verifiedFactorCount > 0 ? "verify" : "setup";
}
