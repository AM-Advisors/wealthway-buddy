# Fix the portal footer

## Problem
The footer on signed-in pages (src/components/portal-footer.tsx) puts the logo, copyright, the legal disclaimer, and seven links on a single flex row. At medium widths the columns collide: "Harmonious" runs into "support@harmonious.co" ("Harmonioussupport"), the copyright sits awkwardly beside the disclaimer, and the links stack in a ragged column.

## Changes (one file: src/components/portal-footer.tsx)
- Restructure into a two-column grid on larger screens, stacked on mobile:
  - **Left:** logo + copyright on one line, with the legal disclaimer underneath (max width, muted).
  - **Right:** links in a tidy two-column group — "Policies you've signed", "Privacy Policy", "Terms of Service", "CapTable Privacy", "CapTable Terms", "About" — with "support@harmonious.co" on its own line below so it can never collide with the brand name.
- Keep the navy background, text colors, link destinations and wording exactly as they are.
- Verify in the preview at desktop and mobile widths that nothing overlaps.

## Technical details
- Pure layout/markup change in PortalFooter; no new routes, no data changes.
- The same disclaimer text also appears in the funds page card description and an email template — those are fine and stay untouched.
