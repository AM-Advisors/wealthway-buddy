# Simplify onboarding and separate CapTable navigation

Update the sidebar only, preserving all existing pages and access controls.

## Sidebar changes

- Show one **Onboarding** dropdown with exactly two destinations:
  - **KYC / AML** → the existing combined compliance page
  - **Accreditation** → the existing accreditation page
- Remove the duplicate KYC & AML link from **Your application** so onboarding appears in one place only.
- Keep fund documents and funding outside onboarding; their existing fund-specific pages and links remain unchanged.
- Replace the separate founder and staff Cap table groups with one **CapTable** dropdown:
  - Founders see their existing ownership, securities, employees, investors, fundraising, secondaries, exposure, migration, documents, reports, compliance, and settings pages.
  - Authorized Harmonious staff also see the existing client CapTable requests, plans, migration concierge, and client CapTables pages.
- Preserve collapsible behavior, active-page highlighting, search, mini-sidebar icons, and remembered open/closed state.

## Completion behavior

- Consider onboarding complete after KYC, AML, and accreditation are complete, so the sidebar does not remain open because fund signing or funding is unfinished.
- Keep document and funding status data intact for the fund-specific experience.

## Verification

- Confirm founder, staff, and investor menu variants show only permitted links.
- Confirm desktop and collapsed/mobile sidebar states work and the active dropdown stays open.
- Confirm the project builds without errors.

## Technical scope

Primary changes are limited to `src/components/app-sidebar.tsx` and the small sidebar status response in `src/lib/nav.functions.ts`. No database or fund workflow changes are needed.
