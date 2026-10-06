# Turn on two-step sign-in and sign-in history

## Problem
The security screens (passkey or authenticator code at sign-in, sign-out after inactivity, sign-in and location history) are built but never switched on. Nobody is asked for a second step, and the Account security page always shows an empty history.

## What changes for people
- Everyone who signs in (staff, fund managers, founders, investors) must set up a passkey or authenticator app the first time, then confirm it on each new sign-in.
- People are signed out after a period of inactivity.
- Sign-ins, page visits and sensitive actions start appearing in each person's history and on the staff security activity page.

## Build
1. Wrap the signed-in area with the existing security gate, inside the policy and identity-check gates and around the page content, so the second step happens after sign-in and before any page loads.
2. Confirm that the sign-in, public onboarding links, the investor and manager sign-in pages, and the shared-document links stay outside the gate.
3. Check in the browser: a signed-in staff account is asked to set up the second step, finishes it, lands on its page, and sees new rows on Account security.
4. Check the inactivity timeout signs the person out and returns them to sign-in.

## Technical details
- `src/routes/_authenticated/route.tsx`: mount `SecurityGate` around `<PortalGate>`'s children (`OpsAreaGate` → `Outlet`), passing `onSignOut`.
- Reuse `logSecurityEvent` and the existing activity tracker; no schema changes.
- Risk: existing users are prompted on their next visit. Roll out with a heads-up to the team.
