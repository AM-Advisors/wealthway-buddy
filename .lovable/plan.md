# Let fund managers change investor amounts before signing

## What's happening
Calvin Jung (CORPS Erebor) hasn't signed or sent money, so Dustin should be able to edit him directly. But the record was "locked" the moment Dustin first saved it, and a locked record sends every later change to Harmonious for approval. Dustin tried 5 times to set $500,000 (between 21:58 and 22:19 UTC); each try made a new approval request and cancelled the previous one. One request is still waiting, and the amount still shows $1,000,000.

## Fix
1. Investor record saves skip the lock while the manager edit window is open (no investor signature, no capital sent, not closed). The same check already decides whether edits apply directly, so the two rules can't disagree.
2. After signing or funding starts, the lock and approval apply as they do now.
3. Apply Dustin's waiting request: set Calvin's amount to $500,000, log it as Dustin's change, and mark the request approved so it leaves the approval queue.
4. Tell Dustin the form has two boxes: "Investment amount" (the one he used) and "Commitment amount" (empty). The fix sets the investment amount, which is what the fund shows. If you want the commitment amount filled in too, say so and I'll set both.

## Technical details
- `src/lib/record-locks.server.ts` `lockedSave`: for `actionKey === "investor"`, load the onboarding row and call `investorEditWindow(row)`. If the window is open, run `apply()` without creating a `locked_edit_requests` row. Super Admin and staff paths stay the same.
- One-time data fix: update `investor_onboardings` fff7829f… `requested_amount_cents = 50000000`, insert an `investor_record_changes` row (actor Dustin, field requested_amount_cents, 100000000 → 50000000), set locked_edit_request 32a0f447… to approved with a note.
- Test in `src/lib/record-locks` tests: an unsigned, unfunded investor saves directly; a signed investor still needs approval.
