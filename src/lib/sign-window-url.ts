/** The same signing page as a full tab: embedded links (".../embed/sign/...") become the regular signer link. Only https links are opened. */
export function newTabSigningUrl(embedUrl: string | null | undefined): string | null {
  if (!embedUrl) return null;
  try {
    const u = new URL(embedUrl);
    if (u.protocol !== "https:") return null;
    u.pathname = u.pathname.replace(/^\/embed\/sign\//, "/sign/");
    return u.toString();
  } catch { return null; }
}

/**
 * Where a fund countersigner lands after signing inside an investor's request: the fund's
 * Documents page, never the investor's own investment page (which only the investor can open).
 */
export function fundSignerReturnUrl(offeringId: string, origin = "https://app.harmonious.co"): string {
  return `${origin.replace(/\/+$/, "")}/manager/fund/${encodeURIComponent(offeringId)}/documents`;
}
