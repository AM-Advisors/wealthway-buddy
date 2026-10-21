# Action dashboards, countersigned copies, and automatic funding release

## 1. Fully executed copy on the investor's page (Calvin first)
- Find out why Calvin's page shows only his own signed copy. The likely cause: the investor archive reads the investor-signed file and never picks up the countersigned file saved when Thomas signed. This is not confirmed yet, so the first step is to compare Calvin's stored records against what his page shows.
- Fix: when the fund signer finishes, save the countersigned PDF as the current "Fully executed" copy, linked to the same document version. Keep the investor-only copy as history.
- Calvin's page, the fund manager's Investor → Documents page, and Operations all show the "Fully executed" copy with both signature dates.
- Backfill Calvin's existing countersigned copy. No signatures change.

## 2. Moving to funding automatically after approval and signing
When the investor is approved and every required fund countersignature is done, the same completion step:
- moves the investment to Funding and releases the platform's funding instructions (no money moves; Harmonious still confirms receipt);
- emails the investor once: "Your investment is accepted — funding instructions are ready," with a link to the Fund step;
- writes an entry to the investment history.
This runs whether approval or signing happens last. Every other funding gate stays in place: identity, accreditation, banking setup, closed fund. If one is still open, the investor gets no email, and both dashboards show what is blocking. Calvin's investment is checked against these rules, and the email is sent only if he qualifies.

## 3. "What you need to do" dashboards
- **Fund manager home** (My Funds): one card per open task, across all funds. Tasks include: approve investor, countersign, review accreditation (506(c)), review flagged questionnaire, approve documents, finish setup items, and confirm banking choice. Each card shows the investor or fund, why it matters, who acts (you or Harmonious), and a button that opens the exact screen.
- **Investor home**: one card per investment, showing the next step in order (About You → Verification → Sign → Fund) and the specific item still open. Examples: tax form, accreditation, certifications, waiting on manager (no action needed), or funding instructions ready. It never shows fund totals or investor counts.
- Items waiting on someone else show as "Waiting on Harmonious" or "Waiting on fund manager," so nobody thinks it is their task.
- The task list is built from the existing readiness and signing status, so nothing new is stored and nothing is approved from the card itself.

## 4. Guide updates with real screenshots
- Update the fund-manager guide in "Harmonious User Guides" with the new dashboard, approve-and-sign, the fully executed copy, and funding release.
- Add a short investor guide covering the same steps.
- Screenshots come from the QA Pilot fund with synthetic test accounts only, never real investor data. Each screenshot is labeled with arrows or boxes marking what to click. If test sign-in is still unavailable, I'll take screenshots of the signed-out pages and flag the signed-in screens as pending, not use mock-ups.

## Technical details
- Completion hook: extend `box-sign-complete.server.ts` (`syncSignerRows` / `advanceApplication`) and `approveToFund` to call one idempotent `releaseFundingIfReady(onboardingId)`. It goes through `reconcileInvestmentReadiness` and `funding-status.ts`, and the email key is `funding-ready-{onboardingId}`.
- Executed copy: store the countersigned file reference on the signature record, and have `investor-signed-documents` and `investor-review-evidence` prefer it. Add a one-time backfill for request `a91699ef-…`.
- Dashboards: a pure `action-items.ts` projection built over attention.server / readiness / document-execution-status, plus a `.functions.ts` with exact-fund manager and owner-only authorization. Add tests for ordering, who-acts labels, and no-totals.
- Tests: funding release fires only when approved, countersigned, and all gates are clear; the email is sent once; the executed copy appears for the owner and exact-fund managers only.
