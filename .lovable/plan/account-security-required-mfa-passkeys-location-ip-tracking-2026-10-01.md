# Account security: required MFA, passkeys, location & IP tracking

## What users will experience
1. **Required two-step sign-in for everyone.** After password or Google sign-in, users without a second factor are sent to a setup screen before they can open anything. Choices:
   - **Passkey** (Face ID, Touch ID, Windows Hello, security key)
   - **Authenticator app** (6-digit code)
   - At least two methods are encouraged. One-time **recovery codes** are shown once at setup.
   Each new sign-in asks for the second step. Investors complete this before About You.
2. **Location permission.** After sign-in the browser asks to share precise location. If someone declines, they can still continue: approximate city/region from their internet address is recorded instead, and the record notes "precise location declined." Blocking people who decline isn't recommended, since many investors would be locked out.
3. **Session timeout.** Users are signed out after 30 minutes without activity, with a 2-minute warning and a "Stay signed in" button.
4. **Leaked password check.** New or changed passwords that appear in known data breaches are rejected.
5. **Active sessions page** (Account → Security): lists devices, browser, approximate location, last active; "Sign out" for one device or "Sign out everywhere else"; manage passkeys, authenticator and recovery codes.
6. **New-location alert.** An email when someone signs in from a new device or new country/region, with a "This wasn't me" link that signs out every session and requires a password reset.

## What gets recorded
For every sign-in, sign-out, failed attempt, second-step result, sensitive action (signing, banking/wire views, approvals, downloads, access changes) and **every page view**:
user, time, IP address, approximate city/region/country, precise latitude/longitude and accuracy when allowed, device/browser, and page or action name. Never page content.
- History can't be edited or deleted.
- Users see their own sign-in history. Super Administrators get a Security Activity screen in Administration with filters by user, IP, country and event type.
- Page views are kept 12 months, then removed automatically; sign-in and sensitive-action records are kept 7 years.

## Things to know
- **Privacy:** recording precise location and every page view is personal data. The Privacy Policy gets a new section on what is collected, why, and how long it's kept. Counsel should review it, especially for investors outside the US (GDPR, CCPA).
- **Passkeys** are a newer sign-in option and depend on browser and backend support. If a device can't use them, the authenticator app still works.
- **Lost second step:** staff can reset a user's two-step sign-in only after confirming identity. A second staff member must approve the reset, and every reset is recorded.
- The existing onboarding-link protection still won't store raw IP addresses (earlier decision); it stays separate from this account log.

## Technical details
- MFA via the auth service's `mfa` API (TOTP + WebAuthn factors); `MfaGate` in `_authenticated/route.tsx` checks `getAuthenticatorAssuranceLevel()` and routes to `/security/setup` or `/security/verify` until aal2. Server enforcement: `requireAal2` middleware wrapper reads the `aal` claim; sensitive server functions reject aal1.
- Recovery codes: hashed (SHA-256 + salt) in `mfa_recovery_codes`; single use.
- `security_events` (append-only, trigger-blocked update/delete): user_id, event_type, path/action, ip, city, region, country, lat, lng, accuracy_m, location_source (gps|ip), user_agent, session_id, created_at. Inserts only through a server function that reads IP from `cf-connecting-ip` and geo from Cloudflare request data (`request.cf`) server-side; client supplies only GPS coords + event type. Throttled page-view logging (route change hook).
- `known_devices` (user, device fingerprint hash, first/last seen, country) drives new-location alerts through existing transactional email.
- Retention: pg_cron job deletes page_view rows older than 12 months (only exception to append-only, done by a security-definer function).
- Sessions page: `user_sessions` projection updated on activity; "sign out everywhere" via admin `signOut(scope: 'others')`; "This wasn't me" token route under `/api/public/security/revoke`.
- Inactivity timer component inside `_authenticated` layout.
- `configure_auth`: `password_hibp_enabled: true`.
- MFA reset: `mfa_reset_requests` with maker-checker (requester ≠ approver), admin factor deletion only after approval.
- Rule recorded in `src/lib/AGENTS.md`; Privacy page section added.
