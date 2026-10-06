# Fund Distributions: Cash, Cash & Shares, Shares

Cash distributions already exist (calculation, wire instruction verification, maker-checker approvals, payment recording, reconciliation, investor notices). This plan adds share distributions, one guided flow per fund, the distribution sheet, the bank file, and the Harmonious fee.

## What you'll get

A **Distributions** tab on each fund (Operations and fund manager views), with a 5-step flow:

1. **Set up**: choose Cash, Cash & Shares, or Shares. Enter the cash amount and/or the shares: company, share class, number of shares, value per share, public or private, and the custodian or transfer agent that will hold them.
2. **Calculate**: each investor's share comes from their ownership, the same numbers as My Share and the K-1s. Cash is rounded to the cent and whole shares are allocated. Leftover cash or fractional shares are shown, never hidden. Any withholding is applied. The Harmonious fee is shown as a fund expense line.
3. **Verify wire instructions**: each cash recipient confirms their bank details through the existing verification step (step-up check plus staff review). Investors who receive only shares confirm the brokerage or custodian account where the shares should go. Unverified investors are flagged and block the send.
4. **Distribution sheet**: a downloadable Excel sheet with the investor's name, entity, ownership %, cash, shares, value, withholding, net amount and verified destination (account numbers masked except on the bank file). Approval needs a second person: the fund manager approves, then Harmonious gives final approval.
5. **Send**:
   - Cash: create a wire/ACH bank file for staff to upload to the bank themselves. Staff then mark each payment sent and enter the bank reference. Payments are only marked "Paid" after reconciliation.
   - Shares: create a transfer-instruction letter and allocation schedule for the custodian or transfer agent. Staff record when the custodian confirms each transfer.
   - Investors get their notice when each payment or transfer is confirmed.

## Pricing (deducted from the fund)
- Cash distribution: $2,500, charged once per distribution.
- Cash & Shares and Shares only: quoted case by case, depending on whether the company is public or private and on the custodian's costs. Staff enter the Harmonious fee and the custodian's cost, each with a note. A price needs a second person's approval (CEO/CRO) before the distribution can be approved.
- The fee appears on the distribution sheet and is recorded as a fund expense in the books.

## Safety
- Nothing is sent automatically. The app never starts a wire, ACH or share transfer. It only prepares files and records what staff confirm they did.
- Server-side permission checks at every step. Every approval needs a different person from the one who prepared it. History can't be edited, only corrected with a new entry.

## Technical details
- Add a new `distribution_kind` (cash | cash_and_shares | shares) and an in-kind security section (issuer, class, shares, price per share, public/private, custodian, custodian cost) to `distribution_batches`, plus `shares_allocated`/`share_value_cents` on `distribution_lines`. These are additive, nullable columns with grants unchanged.
- Add a new `distribution_share_transfers` table (line, custodian, destination account (masked), status, confirmation ref, confirmed_by/at) as append-only events with grants and RLS.
- Extend `distributions-model.ts` with pure share allocation (largest-remainder whole shares) and the fee rule (cash = 250000 cents fixed; other kinds use an approved custom quote). Add unit tests.
- Store the fee as a fund expense line linked to the batch. Custom fees go through the existing pricing approval request pattern.
- Add server fns in `distributions.functions.ts`: `distributionSheetFn` (xlsx), `bankFileFn` (CSV/NACHA-style wire list, unmasked only for authorized finance staff, with every access logged to the audit log), `shareTransferLetterFn` (PDF), `recordShareTransferFn`.
- Add a new `src/components/fund-distributions.tsx` rendered in the shared fund workspace (both modes). Harmonious-only actions are gated by mode and checked again on the server.
- Record in AGENTS.md: in-kind distributions reuse batch/line approvals, and the send step only records actions taken by people.
