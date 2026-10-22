# Identity and AML review on the investor's record

## Today
- Identity (KYC/KYB) and AML results are reviewed on each fund's compliance page. The investor record in Operations shows government ID review only, so reviewers jump between screens.

## What we'll build
A **Verification** card at the top of each investor record, on both the Operations investor page and the investor panel on a fund's Investors tab.

For each investment the investor has, it shows:
- **Identity (KYC, or KYB for entities):** status (Approved, Needs review, Declined, Pending), when it was checked and who reviewed it. Reused earlier checks are labelled as reused.
- **AML screening:** status (Clear, Needs review, Match), the date, and a plain count of matches, such as "2 possible matches".
- **Why it needs review:** a short neutral reason, such as "name differs from ID" or "possible match".

Actions appear only when a check is waiting on a person:
- **Approve**, **Request info** or **Decline**. Request info and Decline require a note. Approve asks for a short reason when the result came back flagged.
- After a decision, the card refreshes and the onboarding step unlocks or stays blocked, following the existing rules.

A "Needs review" badge appears in the Operations investor list, and there's a filter showing only investors waiting on a decision.

## Not changing
- Who can decide stays the same: the exact fund's managers or authorized Harmonious staff, and never someone reviewing their own account. Super Admin self-approval still needs a recorded reason.
- Identity approved with AML pending still allows Sign only. A failed or flagged AML result keeps blocking until a person decides.
- No outside service names and no raw screening reports are shown. Full match details stay with staff who already have access.
- Nothing is approved automatically. Slack alerts and the work queue continue as they are.

## Technical details
- A new read-only server function gathers the investor's applications, identity checks and AML screenings through the existing authorized readers (getInvestorComplianceDetail and the account identity checks). It returns a safe summary only.
- Decisions go through the existing decideComplianceCheck, which keeps its authorization, notes and audit trail. There is no new decision path.
- One shared InvestorVerificationCard is mounted in the Operations investor route and the fund investor panel. The list badge reads the same summary.
- Tests use made-up data and cover: status mapping, the actions shown only for review states, the reason required on flagged approvals, and match details kept out of the summary.
