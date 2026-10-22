# Signed-in countersign walk on a demo fund

You approved a live test on a demo fund. It writes real records and may send real emails to the demo fund's managers. Everything stays on fictional people and a fund marked as demo.

## Setup
1. Pick one demo fund that already has a fund manager account, an approved subscription document and active, released bank details. The candidates are Portal Walkthrough Fund I, Onboarding Walkthrough Fund I and the [QA] Pilot Fund Run 3; I'll choose whichever meets all of this.
2. Confirm the fund is marked demo. Stop if it isn't, or if any investor or manager on it is a real person.
3. Use a fictional investor already on that fund who has passed identity and accreditation but hasn't signed. If there is none, stop and report back instead of creating one by hand.

## Walk (run once per timing option)
For **Pause**, **Parallel** and **At the end**:
1. **As the fund manager:** set "When do you countersign?" on the fund's Documents setup.
2. **As the investor:** sign the subscription documents, then check whether the Fund step and wire instructions are locked or open.
3. **Check the countersign request:** confirm one "countersign requested" record and one manager notice were created, at the right moment for that option:
   - after signing for Parallel
   - after "I sent my funds" for At the end
   - none extra for Pause
4. **As the fund manager:** countersign from the countersign page, then confirm the investment shows approved and "Awaiting countersign" clears.
5. **As the investor:** confirm the wire instructions are open, still masked until clicked, and that the view is logged.
6. Take screenshots at each step.

## Clean up
- Set the demo fund back to Pause.
- Leave all signatures, events and notices in place; they are permanent records by design.
- No funds are marked received, no money moves, and no one is admitted.

## What you'll get
A short pass/fail report for each option, with screenshots and anything that didn't behave as planned. If something fails, I'll fix it and rerun that option.

## Technical details
- The walk signs in through the existing session tool as the demo fund's manager and investor accounts. Each sign-in needs your approval on its card.
- Signing may go through the embedded signing provider. If its webhook doesn't reach this sandbox, signature completion can't be shown end to end, and I'll report that rather than fake it.
- The investor's request-countersign and approve-to-fund paths are checked by reading the investment events back from the database after each step.
