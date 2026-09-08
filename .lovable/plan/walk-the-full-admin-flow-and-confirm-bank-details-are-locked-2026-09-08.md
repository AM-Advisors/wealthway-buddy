# Walk the full admin flow and confirm bank details are locked down

A live end-to-end run through the admin setup flow, followed by a real access test on the fund's bank details. No feature work — this is verification, and anything broken gets fixed as it is found.

## What gets walked

1. Sign in as an administrator and open **Set up a fund**.
2. **Step 1 — Fund details:** create a test fund (name, summary, exemption type, minimum, target) plus its private wire/bank details.
3. **Step 2 — Documents:** add the offering documents, marking which ones must be signed.
4. **Step 3 — Access:** invite a fund manager to that fund by email (creates their account, grants access, sends the invitation).
5. Open the new fund's page and confirm the description, documents and wire details all render, and that the packet download works.

## What gets tested on bank details

The bank details live in a private table reachable only through a protected lookup. The test confirms, from real signed-in sessions:

- The assigned fund manager can read them for that fund.
- A fund manager assigned to a *different* fund cannot.
- A signed-in investor with no invitation to that fund cannot.
- A signed-out visitor cannot.

One clarification on the wording of the request: administrators can also read the bank details, and so can an investor who already has an application in that fund (they need the wire instructions to fund). So the rule being confirmed is "the assigned manager, admins, and that fund's own investors — nobody else." If bank details should be hidden from investors too, say so and that becomes a separate change.

## Technical notes

- Walk the UI with Playwright against the running app, signing in with a minted session for an admin account, then repeating the fund-page read as the new manager and as an unrelated user.
- Verify the access rule directly as well by calling `get_wire_instructions` for each of the four identities, so the result does not depend on UI rendering.
- Confirm the manager invitation reaches `fund_managers` and `fund_invitations`, and that the invitation email was recorded as sent.
- Check the change history on the fund records the creation, the wire details and each document with the acting admin and timestamp.
- The test fund and test manager account created during the walkthrough are removed afterwards unless you want them kept.

## Outcome

A short report of each step: what worked, screenshots of the fund page, the four access results, and fixes applied for anything that failed.
