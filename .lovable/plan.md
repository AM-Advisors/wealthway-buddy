# Publish separated client/staff layouts and verify signed-in

## Goal
Ship the separated client app and Operations site layouts to the live site, then confirm both menus and pages work when signed in.

## Steps

1. **Pre-publish security check**
   - Check for unresolved critical security findings before publishing; if any exist, surface them and ask whether to address first.

2. **Publish**
   - Publish the project so the separated client/staff layouts (menus, styling, host routing) go live on the public URLs.

3. **Signed-in verification**
   - Sign in to the live/preview app (mint a session if needed).
   - Client side: open the client app, confirm the client menu renders, and click through the main client pages (funds, documents, tax, messages) checking they load without errors.
   - Operations side: open the Operations site, confirm the Operations menu renders (no client items), and click through key Operations pages (funds, people, fund migration) checking they load.
   - Confirm the two experiences stay visually and structurally separate, and that access checks still block cross-area pages.

4. **Report**
   - Summarize what was verified signed in, any pages that failed, and the live URL.

## Technical notes
- Frontend changes go live via publish; no backend changes are included in this step.
- Verification uses a test session only — no changes to real data.
