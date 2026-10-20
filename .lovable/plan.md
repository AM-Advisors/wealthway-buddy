# Investor cleanup: one connected investor experience

## What we found
- **Too many reporting pages.** Reports already holds performance, distributions and documents, but Performance, Distributions, Financials and Statements also exist as separate pages that aren't in the investor menu.
- **Investment page is a dead end.** From My investments, an investment opens only its onboarding steps. There are no tabs for capital, activity, performance, reports, documents or tax, even though the link structure for those tabs is already defined.
- **Investor details are kept in three places:** the old admin investor database, the person record, and the investment profile. Which one you edit depends on the screen you're on.
- **Two kinds of investment record.** Older capital, wire and vault screens read the old application records; new investments use the current onboarding records.
- **Staff screens don't link to each other.** The manager's investor page and the Operations investor page have no direct link between them, and the manager investor-onboarding board isn't in the manager menu.
- **Loose links.** Statements doesn't lead to Distributions. Vault, My equity, Wire, Wire confirmation, Prepared and Signatory are reachable only from inside other pages.

## What we'll build

### 1. One investment workspace (investor)
- Turn the investment page into tabs: **Overview, Onboarding steps, Capital, Activity, Performance, Reports, Documents, Tax**.
- Onboarding steps stays exactly the same: About You, Verification, Sign, Fund.
- Every card under My investments opens this workspace. Each tab shows only that investment.

### 2. Merge the reporting pages
- **Reports** becomes the single place for performance, distributions, financials and statements. Its sections can be linked to directly.
- The old Performance, Distributions, Financials and Statements addresses forward to the matching section of Reports, so saved links keep working.
- Statements and Distributions link to each other.

### 3. One source for investor details
- The person record holds the person's name, email, phone and address.
- The investment profile holds the investing party's legal name, tax ID and owners/signers. The login account is never treated as the investing party.
- The old admin investor database edits through these same records instead of its own copy.
- The entity legal name is kept in one place, and the verification records read from it.
- Before changing anything, compare existing records and list any that disagree for Harmonious to review. Nothing is overwritten automatically.

### 4. Old applications vs current onboardings
- The capital, wire and vault screens read the current onboarding records. They fall back to old application records only for history.
- No money movement changes. Wire and ACH stay exactly as they work today.

### 5. Connect the staff screens
- The manager's investor page and the Operations investor page link to each other. Both continue to check access on the server.
- Add **Investor onboarding** to the manager menu.
- Retire the old admin investor database as a separate page. It forwards to the Operations investor page.

### 6. Help and checks
- Update the Help Center articles for the new workspace and the merged Reports page.
- Add tests: every My investments card opens a workspace tab, the old addresses forward correctly, and an investor edit lands on the right record.

## Not changing
Onboarding order, who can approve or edit what, maker-checker rules, closed-fund rules, all money movement and filing rules, and the two unrelated pages also named "onboarding" (client onboarding and the manager's own documents).

## Technical details
- `investment.$onboardingId.tsx`: add `tab` to `validateSearch` next to `step`, and wire up `investmentWorkspaceTabs()` from `client-navigation.ts`.
- `investor-reporting-center.tsx`: add a `section` search param. The standalone routes become `redirect` to `/investor-reporting?section=…`.
- `investor-directory.functions.ts`: delegate profile updates to `investor-record.server.ts` (persons / investment_profiles). Read-only drift report query first.
- `investment-profile-detail.server.ts`: stop updating `entity_verifications.legal_name` directly; read through the profile.
- `investor-capital`, `portal`, `funding`, `vault` functions: read `investor_onboardings` first and keep `investor_applications` as a read-only legacy fallback.
- `ops-record.tsx` and the manager investor route: add cross-links; add the manager menu entry in `client-navigation.ts` and update the navigation tests.
- Record each rule in AGENTS.md.
