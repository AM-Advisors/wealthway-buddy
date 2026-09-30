# Phase 2: marketing pages, admin health screens, end-to-end tests

This phase is low-risk: it doesn't touch investor, fund, tax or money records, and it adds no new data tables.

## 1. Marketing and resources pages (public)

These are adapted from the other project with Harmonious branding and this project's page layout.
- **Solutions:** an overview page, Fund administration software, Cap table software, and one page per solution.
- **Resources:** an overview page, "EIN for an LLC", "Reg D 506(b) vs 506(c)" and "PE software buyer's guide".
- **Compare pages** ("Harmonious vs X"): **held back** for your review, because they make claims about named competitors. They'll be added only after you approve the wording.
- Each page gets its own title and description for search results, plus sitemap entries. Links go in the site footer and the resources menu.
- Any pricing or feature statements are checked against what this platform really offers, and anything it doesn't do is removed. Nothing will promise automatic filing or money movement.

## 2. Admin health screens (Harmonious admins only)

These go under Operations, then Administration. They are read-only and built on records this project already keeps.
- **Email delivery:** failed, bounced and suppressed emails from the email delivery log, with filters by date, template and status. The recipient address is shown partly hidden, and there is no resend button.
- **Webhook log:** incoming updates from the identity check, Box Sign and Plaid, each with its status, when it arrived, and whether it was processed. No raw contents are shown, so no personal data appears.
- **Deploy status:** a simple check that the app and backend are responding, and which version is live. The other project's GitHub panels are left out, because this project isn't set up for them.
- **Error log:** only if this project already records runtime errors. If it doesn't, this screen is skipped rather than adding new tracking.

Access is checked by the server on every request, not just by hiding the menu item.

## 3. End-to-end tests

- Add an automated browser test setup based on the other project's tests, keeping only the checks that fit this app:
  - pages you can't access don't leak their contents;
  - signed-out visitors are sent to sign-in;
  - staff-only pages refuse people who aren't staff;
  - a fund manager only sees their own funds.
- The tests use only labeled synthetic test accounts in the separate QA project. They never run against production data, and they never send email or move money.

## Done when

- The pages appear in the menu and footer, admins can open the health screens, and people who aren't staff are refused.
- The full test suite, code check and build all pass.

## Technical details

- Routes: `src/routes/solutions.*.tsx`, `src/routes/resources.*.tsx` (public, SSR, their own `head()` for each); `src/routes/_authenticated/ops.email-health.tsx`, `ops.webhook-log.tsx`, `ops.system-status.tsx`.
- Data comes from `email_delivery_events`, `didit_webhook_events`, `box_sign_webhook_events` and `plaid_webhook_deliveries`, through new `src/lib/ops-health.functions.ts` (`requireSupabaseAuth` plus `requireOperations`, admin only). Selected columns are projected: no payloads, and email addresses are masked.
- Menu entries go in `src/lib/ops-capabilities.ts` (Administration). Public links go in the footer and the sitemap route.
- E2E: `playwright.config.ts` and `e2e/` specs driven by environment variables for the QA base URL and synthetic accounts. They're kept out of the unit test run.
