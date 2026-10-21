# Client fund setup saves directly, without Harmonious approval

## What changes

- When a fund manager saves Fund Details or Fees & Team on the shared Fund Setup page, it saves straight to the fund, every time. Today this only happens until the first investor signs; after that it goes to Harmonious review.
- No "Waiting on review" label, Harmonious review task or Slack/email review notice for these sections.
- Each save still records who changed what and when in Audit History, and goes through the same checks (required fields, duplicate fund names).
- If a save fails a check, the manager sees the error on the page. It no longer quietly falls back to a Harmonious review.

## What stays with Harmonious

- Bank / wire details: Harmonious still verifies them before investors can see them.
- Fees don't change until Harmonious approval or new fund documents are provided with the updates.
- Uploaded documents (EIN letter, W-9, operating agreement, PPM, subscription agreement) still go to Harmonious, since they feed IRS, signing and investor records.
- Identity, money, pricing and IRS-issued EIN recording are unchanged.

## Technical details

- `src/lib/fund-manager-submissions.server.ts` `submit()`: for a fund's manager, `fund_details` and `fees_team` always apply through the existing `runSelfServe` + `apply` path (drop the `fundEditWindow` condition); a failed apply throws instead of creating a review task.
- `directSetupEdits` in `fund-setup-guided.server.ts` and `fund-manager-submissions.server.ts`: true for staff and for the fund's managers, so the form stops showing "Waiting on review" for these sections.
- Authorization unchanged: only managers of that exact fund (or staff) can save; checked on the server.
- Investor-detail edits keep their own signed/funded lock (separate rule).
- Test: a manager's fund details save is applied (`applied: true`) after an investor has signed; bank and document submissions still return `applied: false`.