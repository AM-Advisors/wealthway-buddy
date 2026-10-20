# Fix everything from the platform review

Work happens in the order recommended in the review. Group 2 (old pages that only redirect) stays as it is so saved bookmarks keep working.

## 1. Failing automatic checks (30 of 2,911)
- **Out of date because the rules changed:** update the Fund Team, fund-request (exemption selector) and SPV template checks to match the current rules. These are: managers can add teammates, the exemption selector exists, and SPV templates need no separate approval.
- **Menu and role checks:** look into each failure, covering client menus, the staff role hierarchy, host-based access and session checks. If the check is right and the code is wrong (for example "CRO assigns below only" or "sales managers assign sales and AMs"), fix the code by tightening access, never loosening it. If the check is out of date, update the check.
- **Safety checks** (staff-only investor fields, the marketing approval gate, and the "never writes" rule for readiness and pilot code): first confirm the rule is still enforced in the code. Then fix whichever side is wrong. These checks are never removed.
- **Service levels:** limit the SPV and Fund levels to the options they're allowed to have.
- Re-run the full test suite and report the result.

## 2. Panels nothing shows (11)
- **Remove after confirming they're unused and replaced:** Ownership card, Identity verification card, Investment profile picker, Investor sign-off card and Onboarding bank details. The current About You, Verification, Sign and Fund steps already cover them.
- **Client invoices and Client SOW:** add them to the client page in Operations if Billing doesn't already show the same information. Otherwise remove them.
- **Diligence rooms:** add them to the deal room, using the existing NDA and server-side access checks.
- **Delegation banner and Third-party badge:** show them while a professional is working on a client's behalf. This is display only and grants no authority.
- **Quick wire confirm:** leave it off. It's a money path, and your standing rules apply.

## 3. Missing details
- **Investor page, tax ID:** fund managers and Harmonious can enter it. It's stored protected, and after saving only the last four digits are shown. Edits before signing or funding save directly; after that they need approval.
- **Investor page, distribution banking:** these are bank details for future distributions only. They follow the same edit window, are recorded on the investor's history, need Harmonious verification, and never trigger any payment.
- **Owners and signers:** turn the list into an editable form with add, edit and remove. It uses the shared investor engine and records every change.
- **Entity and registered agent:** check whether managers can edit these on their own funds. If they can't, open them through self-service, with the same scope checks and recorded history.
- **Help Center:** write articles for the new self-service steps: onboarding link, banking path, EIN, team and invites, plus the new fields above.

## What won't change
- No money movement, filings, tax payments or identity decisions get automated or opened up.
- Client, Operations and Sales stay separate. Every access check stays on the server.
- No real fund or investor data is changed. Old addresses keep redirecting.

## Technical details
- Tests are run with vitest across the whole suite. Each changed or newly opened rule gets a focused test.
- Tax ID and banking reuse the existing protected fields and the investor edit window (pre-signing direct, post-signing approval). Display is masked server-side.
- Panels are only removed after a search shows no imports or dynamic references.
- The new self-service rules are recorded in AGENTS.md.
