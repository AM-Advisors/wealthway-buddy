# Fund setup: enter once, saves everywhere

## Goal
The fund's own record should be the single place each fact lives. Every fund screen (Funds & SPVs, Fund Setup, Setup New Fund request, Offering Statement, investor onboarding) should read from that record and save back to it. No more typing the same value twice.

## What is out of sync today
1. **Legal name:** a rename on Fund Setup doesn't show up in investor onboarding or the Operations queue. Those screens still read an old copy.
2. **Fees and carry:** management fee, carried interest, preferred return and per-class fee/carry/hurdle from the "Setup New Fund" request aren't saved. Fund Details shows "Not set yet".
3. **Manager / GP and contacts:** the GP, signatory, lawyer, accountant and bank contact from the request never reach the fund's Team tab.
4. **Entity type and state of formation:** these are saved twice, in two different formats. Later edits update only one copy.
5. **Target raise:** it's kept in three places, and only one is updated when you edit it.
6. **Bank name:** it can be entered in two places that don't share values.
7. **SS-4 answers:** if the save fails, they're lost without any warning.

## What changes
- **One source for each fact:** the fund record holds legal name, entity type, state formed, target raise and wire details. Fees live in the fund's fee terms. People live on the Team tab.
- **Setup New Fund saves everything:** fees and carry go into the fund's fee terms as an entry waiting for approval. Approval rules stay the same. GP and contacts go onto the Team tab as unconfirmed entries. If a person might already exist, it goes to the normal review queue instead of being merged.
- **Old copies follow the main one:** Fund Setup shows the main values and saves to them. The old duplicate fields are kept but no longer used. Existing funds are backfilled once, and any conflicts are reported for review rather than overwritten.
- **Offering Statement starts from the fund:** it pre-fills target raise, fee and carry from the fund and shows "Differs from fund" if they don't match. Statement-only wording stays separate.
- **Bank name:** the Fund Setup bank step uses the fund's wire instructions.
- **SS-4 failures show up:** if the save fails, a visible "SS-4 answers not saved" task is created for Operations.

## Not changing
- Rules for legal-name history, fee approval, EIN protection and launch approval.
- Any money movement or filings.

## Technical details
- Change reads in `investor-onboarding.server.ts:437` and `cross-client-queue.server.ts` to use `offerings.legal_entity_name`. Stop writing `fund_setups.legal_fund_name` in `fund-request-model.ts` and `fund-setup.server.ts`.
- In `submitFundRequest`, map fee and class terms to `fund_fee_terms` as pending approval (through `setFees` logic). Map people through `related-person.server.ts` into `fund_managers` or the review queue.
- Mark `fund_setups.entity_type`, `domicile`, `target_size_cents` and `bank_name` as DEPRECATED. Point the fund-setup-phase3 bank step at `save_wire_instructions`. Backfill `offerings` only where its value is empty, and log conflicts as tasks.
- Seed `offering_statements` from `offerings` and `fund_fee_terms` on first open, and show a mismatch badge.
- Trace `client-intake.functions.ts` bank, EIN and person fields, and route them the same way.
- Add an AGENTS.md rule saying fund facts are read and written only through these sources.
