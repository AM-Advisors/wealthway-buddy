# Funding Confirmation Step

Before an investor can start a wire or an ACH debit, make them read the fund's own instructions and confirm the details are accurate. Nothing is recorded against the payment until they do.

## What the investor sees

The funding step gains an intermediate confirmation screen between choosing a method and submitting.

**Wire path**
1. Choose wire.
2. A "Confirm your wire details" panel appears showing the fund's actual instructions — bank name, beneficiary, account and routing numbers, reference code and commitment amount — laid out clearly, with a copy button.
3. A fraud warning: these details came from Harmonious, never act on wire details sent by email, and call the fund to verify before sending.
4. Three checkboxes the investor must tick:
   - I have reviewed the wire instructions above for this fund.
   - I confirm the amount and reference code are correct.
   - I understand Harmonious will never email changed bank details, and I will verify any change by phone.
5. Continue stays disabled until all three are ticked. Only then is the wire payment recorded and the "mark wire sent" form shown.

**ACH path**
Same shape, with the ACH-specific summary — amount to be debited, account ending, fund name and reference — and checkboxes covering review of the debit details, accuracy of the bank account entered, and authorization for Harmonious to debit that account once.

Both paths show the exact fund name and commitment amount, so a mismatch is visible before money moves. Confirmation is per method: switching from wire to ACH clears the acknowledgement and requires a fresh one.

## What gets recorded

Each acknowledgement is stored against the application: method, the checkbox statements agreed to, a fingerprint of the wire instructions as displayed at that moment, timestamp, IP and device. If the fund later changes its wire details, the stored fingerprint no longer matches and the investor is asked to review and re-confirm before proceeding.

Admins and fund managers see the acknowledgement on the application review page — who confirmed, when, and against which version of the instructions.

## Technical notes

- New table `funding_acknowledgements`: id, application_id, method, instructions_hash, statements (the agreed text), acknowledged_at, ip_address, user_agent, created_at. RLS: investors read and create only their own rows and can never update or delete them; admins and the fund's managers can read. GRANTs for authenticated and service_role.
- `chooseWire` and `startAchDebit` in `src/lib/funding.functions.ts` refuse to run without a matching, current acknowledgement for that method — the check is server-side, so ticking boxes in the browser alone is not enough.
- New `acknowledgeFunding` server function computes the instruction hash server-side from the stored wire details (not from anything the browser sends) and records the row.
- `getFunding` also returns the current acknowledgement and whether it is still valid for today's instructions.
- `src/routes/_authenticated/onboarding.funding.tsx` gains the confirmation panel and gating; `src/components/application-review.tsx` displays the acknowledgement record. Existing funding behaviour, statuses and the dashboard are otherwise unchanged.
