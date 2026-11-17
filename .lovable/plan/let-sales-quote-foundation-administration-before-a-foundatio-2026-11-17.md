# Let Sales quote Foundation Administration before a foundation exists

## What changes for you
- When you build a quote, you can add a Foundation Administration service even if the client doesn't have a foundation set up yet. You type the planned foundation name (for example "Smith Family Foundation, to be formed") and pick the service, dates and billing start.
- Picking a foundation service from the "Add a service from the rate card" list now opens that setup box. It no longer adds a line that fails when you save.
- The quote, proposal and SOW show the planned foundation name. The line is marked "Foundation to be formed".
- If the client already has a foundation on file, you can still pick it as you do today.

## What stays the same
- Foundation pricing still needs CEO or CRO approval.
- Quotes still can't be sent until Foundation Administration is turned on.
- Duplicate-coverage checks still run once a real foundation is linked.
- The planned foundation never sets up the actual foundation on its own. When the client signs, Operations links or creates the real foundation from the client's Foundation tab before any work starts.

## Steps
1. Allow a foundation line to carry either an existing foundation or a planned foundation name.
2. Update the setup box with a "Foundation not formed yet" option and a name field, and send rate card picks to this box.
3. Have saving check planned-name lines (pricing, dates, approval) but skip the duplicate-coverage check, which needs a real foundation.
4. Show "Foundation to be formed · name" on the quote, proposal and SOW, and on the signed handoff as a follow-up for Operations to link the real foundation.
5. Add tests: a planned-name line saves and needs CEO or CRO approval, a plain rate card foundation line can't be added, and sending stays blocked while Foundation Administration is off.

## Technical details
- foundation-admin-model.ts: `foundationLineInputSchema` makes `foundationProfileId`/`clientEntityId` optional with a required `plannedFoundationName` when they're absent (refine). The snapshot records `plannedFoundationName` and `entityName`.
- foundation-admin.server.ts `verifyFoundationQuoteLine`: the planned branch skips the profile/entity lookup and the coverage query, then prices and snapshots normally. `siblings` handling only applies to linked entities.
- sales-quotes.server.ts: unchanged gate, with a clearer error that names the line.
- sales_.quotes.tsx: filter `isFoundationKey` from the rate card Select; open the configurator with `initialComponent`.
- foundation-configurator.tsx: a toggle between an existing foundation and a planned name, with `initialComponent` support.
- sales-handoff.server.ts: add "link foundation entity" to the handoff task when a planned line is signed.
- No database schema change (snapshot is JSON). If any DB function reads `foundation_snapshot->>clientEntityId` as required, update it to tolerate null.
