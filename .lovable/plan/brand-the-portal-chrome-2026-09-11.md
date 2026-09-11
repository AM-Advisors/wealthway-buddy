# Brand the portal chrome

Every signed-in page currently sits under a plain 48px strip with just a menu button, a white side menu, and no footer. This makes the portal look unfinished next to the public Harmonious site. This plan gives the portal a real branded top bar, a navy side menu, and a slim footer, and carries the same look onto the sign-in screens.

## Top bar (all signed-in pages)

- Harmonious wordmark on the left, linking to the person's home screen, next to the menu button.
- The current client or fund name shown as context when the page has one, so people know which engagement they are in.
- On the right: the signed-in person's name and role, and a sign-out control moved out of the side menu into a small account menu.
- Sticky at the top, white surface with a hairline border and a thin teal accent line, so it reads as Harmonious rather than a default admin panel.

## Side menu

- Deep navy panel with white text, matching the brand palette (navy #002856, deep navy #142647, teal #5DC6D1).
- White wordmark at the top, teal marker and lighter navy fill on the current page, teal on hover.
- Section labels in muted white; the collapsed icon-only state keeps the same colours.

## Footer (all signed-in pages)

- Slim navy footer pinned below the page content with:
  - Harmonious mark and the current year.
  - The standing line that Harmonious is an administrator, technology and recordkeeping provider, not an investment adviser, broker-dealer, custodian or legal counsel.
  - Links to support email and the privacy and terms documents already published in the portal.

## Sign-in screens

Sign-in, client sign-in, registration, password reset and the sign-off screen get the same treatment: navy brand panel or banner with the wordmark, brand typography, and the same slim footer line, so the journey from sign-in into the portal looks continuous.

## Styling

- Headings switch to Rubik and body text to Poppins consistently across portal pages (already loaded, applied unevenly today).
- Cards, tabs and buttons pick up brand tokens: navy primary, teal focus rings and active states, softer brand-tinted borders and surfaces.
- No new colour values are hardcoded; everything uses the existing brand tokens in the stylesheet.

## Technical notes

- New `PortalTopbar` and `PortalFooter` components, mounted once in `src/routes/_authenticated/route.tsx` around the existing `PolicyGate` / `PortalGate` / `Outlet`, so every signed-in page inherits them without touching individual routes.
- `src/components/app-sidebar.tsx`: navy treatment via the existing `--sidebar-*` tokens in `src/styles.css` rather than per-component colour classes; sign-out stays available in the collapsed state through the new account menu.
- `src/styles.css`: retune `--sidebar`, `--sidebar-foreground`, `--sidebar-accent`, `--sidebar-primary`, `--sidebar-border` and `--ring` to brand values; add heading font application for `h1`–`h3`.
- Auth routes (`/auth`, `/client-login`, `/auth/register`, reset, `/sign-off`) wrapped in a shared `AuthShell` component carrying the brand panel and footer.
- Page-level layout, data loading and permissions are untouched; this is presentation only.
