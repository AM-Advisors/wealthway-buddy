# Harmonious-owned Google OAuth (remove Lovable-managed OAuth from sign-in)

## Goal
Google sign-in shows "Harmonious" on Google's consent screen instead of Lovable's shared app, by calling Supabase Auth's Google provider directly. The Google Client ID/Secret live in the backend auth provider settings — never in frontend code.

## Exact files and lines to change

### 1. `src/routes/auth.index.tsx` (staff/general sign-in)
- **Line 7**: remove `import { lovable } from "@/integrations/lovable/index";`
- **Lines 64–82** (`signInWithGoogle`): replace the `lovable.auth.signInWithOAuth(...)` call with:
  ```ts
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/auth` },
  });
  ```
  On error, toast a friendly message (mapped for provider-not-enabled / redirect mismatch) and record the failed attempt via the existing `recordAttempt`. On success the browser redirects to Google; the existing `useAuth` session listener (lines 40–50) navigates after return. No changes to password sign-in (lines 84–99).

### 2. `src/routes/auth.register.tsx` (registration)
- **Line 10**: remove the `lovable` import.
- **Lines 44–57** (`signUpWithGoogle`): same replacement with `redirectTo: ${window.location.origin}/auth`. Email/password sign-up (lines 59–82) untouched.

### 3. `src/routes/client-login.tsx` (client sign-in)
- **Line 7**: remove the `lovable` import.
- **Lines 60–73** (`signInWithGoogle`): same replacement with `redirectTo: ${window.location.origin}/client-login`; failed attempts also go through `recordAttempt`. The existing listener (lines 43–46) routes signed-in clients to `/client`.

### Not changed
- `src/integrations/lovable/index.ts` stays — other features (email, error reporting) still use it; only its OAuth helper is no longer called.
- Supabase client, session persistence, `useAuth`, post-sign-in role routing, password flows: untouched.
- No Google credentials in code, no `VITE_*` additions.

## Error handling (all three pages, shared pattern)
- Provider not configured / disabled → "Google sign-in isn't available right now — use your email and password."
- Redirect URI mismatch (`redirect_uri` / `redirect` in the error) → "Google sign-in is misconfigured; please contact support."
- Cancelled sign-in (user returns with no session) → the page simply stays on the sign-in form; on load we also check the URL hash for `error=access_denied` / missing session after an OAuth return and show a calm "Sign-in was cancelled" notice instead of failing silently.

## Backend configuration (requires your input)
Direct Supabase OAuth only works once the backend's Google provider holds Harmonious's own credentials:
1. In Google Cloud Console: create an OAuth client (Web), set the consent screen to the Harmonious name/logo, add the authorized JavaScript origins (`https://onboard.harmonious.co`, preview URL) and the backend's OAuth callback URL as the authorized redirect URI.
2. I'll then enable/configure the Google provider in the backend auth settings with your Client ID and Client Secret — I'll request the secret through the secure form when we get there; it never enters the codebase.
3. Until those credentials are in place, the button will show the "not available" message above rather than failing cryptically.

## Verification
- Typecheck + build.
- Playwright: click "Continue with Google" on all three pages, confirm the redirect goes to `accounts.google.com` with the Harmonious client ID (not Lovable's), confirm cancelled sign-in returns cleanly, and confirm password sign-in still works.
