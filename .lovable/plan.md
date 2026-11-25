# Close request: new layout and automatic Form D / Blue Sky costs

## What you'll see
The Close tab's "Prepare Fund Close" form becomes a full page laid out like your mockup, with collapsible sections. Saved requests show the same sections read-only (second mockup). Fund managers and Operations see the same layout; Operations review controls stay underneath.

1. **Close details**: close date requested, amount for close, investors in this close.
2. **Fees**: management fee (from the fund's approved terms or side letters), bank name, address.
3. **Legal fees**: on/off, payee account, amount, due date.
4. **Broker-Dealer fee**: on/off, fee amount, payee account, broker-dealer name, due date. Saved view has a "Generate Broker-Dealer Agreement" button (draft only, needs approval before signing).
5. **Form D & Blue Sky fees**:
   - Harmonious Form D electronic filing: always $160, cannot be switched off or edited.
   - One line per state, worked out from the home addresses of investors in this close, with that state's fee.
   - States already filed on the fund's Compliance tab show "Already filed" at $0 (no double charge).
   - States with a formula or unclear fee show "Needs review" instead of a guessed number.
   - Investors missing an address are listed so you can fix them.
   - Total at the bottom.
6. **Receiving account (wire to)**: account name, bank name, address, account number, routing number (masked after saving, as today).

"Save details" and "Send for review" work as now; nothing files or sends money automatically.

## Question for you
I don't have a state fee table built in yet. I'll create one from the current NASAA fee list, marking any state I can't confirm as "Needs review". Tell me if you have a fee sheet you'd rather I use.

## Technical details
- New `src/lib/blue-sky-fees.ts`: per-state fee table (fixed cents or `review`), `estimateCloseFilingCosts({ investorStates, filedStates })` returning Form D 16000 cents always + state lines + total. Unit tests: Form D always 16000; filed state = 0; review state excluded from total but flagged; duplicate investors in one state counted once.
- `getCloseCandidates` returns each investor's state from their saved address (investment profile / person address) and the fund's filed Blue Sky states from `fund_regulatory_filings`.
- `request-close-dialog.tsx` reworked into section layout (Collapsible cards, on/off Switch); new fields saved into existing `details` JSON (closeAmount, legal payee/due date, broker-dealer name/payee/due date, wire address); manual states box removed in favor of computed states (with staff override note).
- `CloseDetailsSummary` rebuilt to the read-only mockup layout; shared by manager and Operations.
- Server recomputes the cost estimate on submit so the saved figures can't be edited in the browser.
