# Separate the client app and Operations

## Result
- **app.harmonious.co:** clients, fund managers, investors and professionals, with a clean white layout and a light client menu.
- **ops.harmonious.co:** authorized Harmonious staff, with a clearly labeled staff workspace, navy menu and more compact work navigation.
- Keep harmonious.co as the public website. Preserve existing links and onboarding addresses.

## Changes
1. Complete address separation for Operations, Sales, Marketing and Account Management; currently some staff sections are classified as client pages.
2. Keep shared account, inbox, policy and sign-in pages on the address where they are opened. Make the Operations home address open the staff experience, rather than bouncing to the client website.
3. Keep the client menu client-only, including for staff who also have client access. Offer an explicitly labeled link to open the other application only when the person's existing access permits it.
4. Visually distinguish the two menus and top bars. Preserve client branding and Light / Dark / Auto appearance.
5. Show appropriate client or staff wording on sign-in, and preserve the intended destination after sign-in. Separate addresses may require signing in on each; never transfer session tokens in URLs.

## Unchanged
- Existing permissions, approvals, financial safeguards and document access.
- The shared fund details, Fund Setup form and Add Fund or SPV process.
- No separate database, new staff access, invitations, money movement or publishing.

## Technical details
- Extend the existing host-routing and navigation projections rather than creating a second router or duplicating fund screens.
- Use shared address classification for direct requests and client-side navigation, preserving local/preview combined operation and existing white-label addresses.
- Keep server-side authorization on every private action; addresses and display modes grant nothing.
- Add focused tests for staff sections, shared pages, wrong-address redirects, preserved query strings, and no redirect loops.
- Verify client and staff menus, account switching and sign-in destinations with synthetic QA sessions where available; report any blocked checks honestly.