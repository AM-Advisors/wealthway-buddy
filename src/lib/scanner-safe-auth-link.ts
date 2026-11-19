/**
 * Password reset emails link to our own page, which uses the one-time code only
 * when the person presses Continue. Company email scanners (they open every link
 * the moment an email arrives) can no longer use up the link before the person does.
 */
const ALLOWED_HOST = (h: string) => h === "harmonious.co" || h.endsWith(".harmonious.co") || h.endsWith(".lovable.app");

export function scannerSafeRecoveryUrl(verifyUrl: string, fallbackOrigin: string): string {
  try {
    const u = new URL(verifyUrl);
    const token = u.searchParams.get("token");
    if (!token || u.searchParams.get("type") !== "recovery") return verifyUrl;
    const tokenHash = token.replace(/^pkce_/, "");
    let origin = fallbackOrigin;
    const back = u.searchParams.get("redirect_to");
    if (back) {
      try { const r = new URL(back); if (r.protocol === "https:" && ALLOWED_HOST(r.hostname)) origin = r.origin; } catch { /* keep fallback */ }
    }
    return `${origin}/reset-password?token_hash=${encodeURIComponent(tokenHash)}&type=recovery`;
  } catch {
    return verifyUrl;
  }
}
