# Sidebar reset, fund-based signing, Cap table dropdown

Three changes to how people move around the portal. No existing functionality is removed —
the same forms and records keep working, they just live in the right place.

## 1. Onboarding is only identity and accreditation

The Onboarding section of the menu (and the step rail across the onboarding pages) becomes:

1. KYC and AML
2. Accreditation

Signing fund documents and sending money are no longer onboarding steps. They belong to a
fund, because a person only signs and funds if they decide to invest in that fund.

## 2. Signing and funding move under the fund

New fund pages for the investor:

- `/fund/{fund}/documents` — review and e-sign the fund documents, subscription details
- `/fund/{fund}/funding` — wire or ACH, reference code, confirm the transfer

Each page is opened from the fund itself, so the investor always sees which fund they are
signing for. The old addresses `/onboarding/documents` and `/onboarding/funding` keep working
and send the person to the matching fund page, so no saved link or email breaks.

Where these pages are reached from:

- The fund card on the portal ("Sign fund documents", "Send your funds")
- The fund's page and the diligence room for that fund
- The dashboard next-step card, which now points at the fund the investor is in

Nothing about the documents, signature records, wire instructions or audit trail changes —
only which fund they are attached to becomes explicit.

## 3. Cap table becomes its own dropdown

A new "Cap table" section in the sidebar, separate from "Clients and money" and from
"Your application":

- Founders see: Overview, Cap table, Securities, Employees, Investors, Fundraising,
  Secondaries, Exposure, Documents, Reports, Migration, Reconciliation, Compliance, Settings
- Harmonious staff see: Cap table requests, Cap table plans, Migration concierge,
  Client cap tables

Each person only sees the entries they are allowed to open, as today.

## Technical notes

- `src/components/app-sidebar.tsx`: split `investorItems`, drop the cap table entries from
  `clientsAndMoneyItems`, add a `capTableItems` group (founder + staff variants, shown by the
  existing entitlement/role checks), and trim `stepRoutes` to kyc/aml/accreditation.
- `src/components/OnboardingStepper.tsx` and `src/lib/step-rail.functions.ts`: reduce the rail
  to the three onboarding steps; keep the documents/funding status data for the fund pages.
- New routes `_authenticated/fund.$offeringId.documents.tsx` and
  `_authenticated/fund.$offeringId.funding.tsx` reuse the current page bodies, with the fund
  name in the header and each route's own `head()` metadata.
- `documents.functions.ts` and `funding.functions.ts` gain an optional `offeringId` input;
  when present the handlers resolve the caller's application for that offering (still
  `user_id = auth.uid()` scoped) instead of `activeApplicationId`. Absent, behaviour is
  unchanged.
- `onboarding.documents.tsx` / `onboarding.funding.tsx` become thin redirects to the fund
  route for the active application (or to `/portal` when there is no application).
- Update the links in `portal.tsx`, `dashboard.tsx`, `documents.tsx`, `apply.tsx`,
  `subscription.tsx`, `wire-confirmation.tsx`, `application-checklist.tsx`,
  `diligence.$offeringId.tsx` and `email-templates/steps.ts` to the fund-scoped paths.
- Verify with typecheck, build, and loading `/fund/{id}/documents`, `/fund/{id}/funding`,
  the old onboarding paths, and the cap table entries.
