# Plan: Activate Harmonious-owned Google sign-in

## Goal
Make the live portal's Google button use the Harmonious-branded OAuth consent screen instead of the shared one. The site code was already switched to direct backend Google sign-in last session — only the provider credentials are missing.

## Why you paste them, not me
Google sign-in credentials only work when entered into the backend's Google provider settings screen. That screen is itself a secure, write-only form (values are stored encrypted and never displayed back). My secure form stores secrets for server code — it cannot reach the sign-in provider configuration, so values entered there would sit unused. Pasting directly into the backend settings is both the secure path and the only path that works.

## Steps

### 1. You enter the credentials (2 minutes)
1. Open the backend sign-in settings (button below, or Cloud → Users → Auth Settings → Sign-in methods → Google).
2. Switch Google from the managed/shared option to **custom credentials** (BYOC).
3. Paste your Harmonious **Client ID** and **Client Secret**.
4. Save.

### 2. You verify the Google Cloud side matches
In Google Cloud Console → your OAuth client:
- **Authorized JavaScript origins** include `https://onboard.harmonious.co`, `https://portal.harmonious.co`, and the preview URL.
- **Authorized redirect URI** exactly matches the callback URL shown in the backend's Google settings (copy it from there — a mismatch is what caused the error in my last test).
- Consent screen shows the Harmonious name and logo and is set to **In production** (not Testing), or sign-ins will be limited to test users.

### 3. I verify end to end (after you confirm)
- Walk `/auth`, `/auth/register`, and `/client-login` with a browser and confirm the Google consent screen shows **Harmonious**, not Lovable.
- Confirm a completed sign-in lands on the right destination and a cancelled one shows the calm notice.
- Republish so `onboard.harmonious.co` picks up everything.

## What I will NOT do
- Ask you to paste the Client Secret into chat — never do that.
- Store the credentials as runtime env secrets — they would not connect to sign-in.
- Touch password sign-in, session handling, or any other auth code.

## Technical notes
- No code changes expected in this phase; the redirect destinations (`/auth`, `/auth`, `/client-login`) are already correct.
- If a redirect-URI mismatch appears during verification, the fix is on the Google Cloud side (step 2), not in code.
