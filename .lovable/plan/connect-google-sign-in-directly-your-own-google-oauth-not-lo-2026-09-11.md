# Connect Google sign-in directly (your own Google OAuth, not Lovable-managed)

## Goal
Replace the Lovable-managed Google sign-in with a direct connection using your own Google Cloud OAuth credentials, so the consent screen shows your app and you own the Google relationship.

## What changes in the app

1. **Sign-in page** (`src/routes/auth.index.tsx`)
   - Replace `lovable.auth.signInWithOAuth("google", ...)` with a direct call:
     `supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } })`
   - On return from Google, the existing session listener picks up the session; keep the post-sign-in navigation to the right destination.

2. **Registration page** (`src/routes/auth.register.tsx`)
   - Same replacement for "Continue with Google".

3. **Keep everything else**
   - The `src/integrations/lovable` module stays (auto-generated, not edited); it's just no longer used for Google.
   - Super-admin detection for @harmonious.co Google accounts keeps working unchanged (it reads the provider from claims).

## What you must do in Google Cloud (one-time, can't be done from code)

1. In Google Cloud Console → APIs & Services → OAuth consent screen: add `harmonious.co` and your Lovable domains as authorized domains; scopes: `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`.
2. Create credentials → OAuth Client ID → Web application.
3. Under Authorized redirect URIs, paste the callback URL shown in Lovable Cloud → Authentication Settings → Sign In Methods → Google.
4. Copy the Client ID and Client Secret into that same Google provider section in Lovable Cloud Authentication Settings. This switches Google from Lovable-managed credentials to yours.

Until step 4 is done, Google sign-in will fail — so the code change should land together with your credential setup.

## Verification
- Typecheck/build pass.
- After credentials are in place: sign in with a Google account on the preview and confirm landing on the right portal.

## Technical notes
- Only two call sites change (auth.index.tsx, auth.register.tsx).
- `redirectTo` stays `window.location.origin` (public), consistent with existing post-login routing.
- Publishing is required for the published site to use the new flow.
