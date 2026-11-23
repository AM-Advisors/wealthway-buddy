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
