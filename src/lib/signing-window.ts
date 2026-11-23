/**
 * Pure rules for the embedded signing window. Nothing here signs or records a
 * signature: completion always comes from the signing service's own status.
 */

/** Wait this long for the document to register as loaded before offering a new tab. */
export const RESCUE_AFTER_MS = 10_000;
/** A window opened this long ago that the signing service never saw load counts as stuck. */
export const NEVER_LOADED_AFTER_MINUTES = 15;
/** Checks after returning from a new tab; the signing service can take a few seconds to report. */
export const RETURN_CHECK_DELAYS_MS = [0, 3_000, 8_000] as const;

/**
 * Browsers that commonly block the embedded signing window (third-party cookies):
 * desktop Safari and every browser on iPhone or iPad (all use Safari's engine).
 */
export function prefersNewTab(userAgent: string | null | undefined): boolean {
  const ua = String(userAgent ?? "");
  if (!ua) return false;
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  if (/Android/i.test(ua)) return false;
  const safari = /Safari\//.test(ua) && /Version\//.test(ua);
  const otherEngine = /Chrome\/|Chromium\/|CriOS|FxiOS|Firefox\/|Edg\/|EdgiOS|OPR\/|OPiOS/.test(ua);
  return safari && !otherEngine;
}

/**
 * True when the signer opened the signing window but the signing service never
 * recorded the document loading, and enough time has passed to call it stuck.
 */
export function windowNeverLoaded(
  signer: { status: string | null | undefined; viewedAt?: string | null | undefined; windowOpenedAt?: string | null | undefined },
  now: Date = new Date(),
): boolean {
  if (!signer.windowOpenedAt || signer.viewedAt) return false;
  if (String(signer.status ?? "").toLowerCase() !== "sent") return false;
  const opened = Date.parse(signer.windowOpenedAt);
  if (Number.isNaN(opened)) return false;
  return now.getTime() - opened >= NEVER_LOADED_AFTER_MINUTES * 60_000;
}
