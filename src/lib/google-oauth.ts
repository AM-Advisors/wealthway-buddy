import { supabase } from "@/integrations/supabase/client";

/**
 * Direct Supabase Google OAuth. Google consent branding comes from the
 * Google OAuth client configured in the backend's auth provider settings —
 * no credentials ever appear in frontend code.
 */

export function mapGoogleOAuthError(message: string | undefined): string {
  const msg = (message ?? "").toLowerCase();
  if (!msg) return "Google sign-in failed. Please try again.";
  if (msg.includes("provider") && (msg.includes("not enabled") || msg.includes("disabled") || msg.includes("unsupported"))) {
    return "Google sign-in isn't available right now — please use your email and password.";
  }
  if (msg.includes("redirect") || msg.includes("redirect_uri")) {
    return "Google sign-in is misconfigured. Please contact support.";
  }
  return "Google sign-in failed. Please try again.";
}

/**
 * Starts Google OAuth. Returns an error message to display, or null when the
 * browser is on its way to Google (the session listener handles the return).
 */
export async function startGoogleOAuth(redirectPath: string): Promise<string | null> {
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}${redirectPath}` },
    });
    if (error) return mapGoogleOAuthError(error.message);
    return null;
  } catch (err) {
    return mapGoogleOAuthError(err instanceof Error ? err.message : undefined);
  }
}

/**
 * Detects a failed/cancelled OAuth return (Supabase appends the error to the
 * URL hash) and clears it. Returns a user-facing message, or null.
 */
export function consumeOAuthReturnError(): string | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash;
  if (!hash || !hash.includes("error=")) return null;
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const code = params.get("error") ?? "";
  const description = params.get("error_description") ?? "";
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  if (code === "access_denied" || description.toLowerCase().includes("cancel")) {
    return "Google sign-in was cancelled — nothing was changed.";
  }
  return mapGoogleOAuthError(description || code);
}
