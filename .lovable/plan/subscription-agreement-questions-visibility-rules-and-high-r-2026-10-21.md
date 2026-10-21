# Subscription Agreement questions: visibility rules and high-risk review

## What changes for the investor

1. **Question 9 (Which IRS form applies)** shows its answer on screen as a locked value (W-9, W-8BEN or W-8BEN-E, worked out from Verification), instead of appearing blank. If Verification isn't finished it reads "Fills in after Verification".
2. **Question 14 (customer of the Funding Bank)** only shows when question 13 (Funding Bank in the U.S. or a FATF country) is answered **Yes**.
3. **Question 16 (identity / formation documents upload)** only shows when question 15 (high-risk FATF jurisdiction) is answered **Yes**. This replaces the earlier rule that tied it to questions 13/14. The upload is required only when it's shown.
4. **Questions 17-24 (the "bad actor" questions: convictions, regulator orders, SEC orders, suspensions, stop orders, postal orders, disqualifying events):** if any is answered **Yes**, the investor sees:
   "Your investment is under review. We'll notify you about next steps."
   They can still submit their answers, but the investment is held: Sign and Fund stay locked until Harmonious clears it.

## Who is told

- When the answers are submitted with any Yes on 17-24, Harmonious Operations (#operations alert tagging the assigned Operations person) and the fund's managers (branded email) get a notice: the investor, the fund, which questions were marked Yes, and that this may make them ineligible to invest. Link opens the investor's review page.
- Sent once per submission; resubmitting the same answers doesn't resend.
- Only Harmonious can clear or decline the hold, with a recorded reason in the compliance history. The fund manager is informed but does not clear it.
- No outside platform names in any wording.

## Technical details

- `standard-investor-questionnaire.json`: add `showWhen` to q14 (`is_the_funding_bank_located_...` equals Yes); change q16 `showWhen` to `is_the_jurisdiction_where_the_wiring_institution_is_located_` equals Yes; tag q17-q24 with `highRisk: true`.
- Questionnaire renderer: render locked values read-only with the value visible (fixes q9); show the under-review message inline when any `highRisk` field is Yes.
- `investor-onboarding.server.ts` submit: server re-evaluates `showWhen` (drops answers to hidden questions, enforces q16 only when shown); if any high-risk Yes, set a compliance hold on the application (new `review_required` reason `bad_actor_disclosure`) via the existing compliance-event log, and call the shared `notifySubmission` Slack helper plus a new `high-risk-disclosure` manager email template, with idempotency key from onboarding id + answer hash.
- Onboarding model: hold keeps Sign/Fund locked and shows "Under review" until cleared through `decideComplianceCheck`.
- Tests: q14/q16 visibility rules, hidden-answer stripping, hold set on any Yes in 17-24 and not otherwise, notification sent once.
