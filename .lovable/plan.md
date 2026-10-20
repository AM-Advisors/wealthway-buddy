# One connected record per person, and the real slowdowns

## Why it's separated today
Features were built at different times, and each kept its own copy of "who this is":

| Where | Records | What it holds |
|---|---|---|
| Person record (the hub) | 267 | name, email, phone, address |
| Login profile | 46 | name shown for the account |
| Investment profile | 241 | legal name, tax ID, owners and signers (correctly separate: the investing party) |
| Current investments | 240 | one per investor per fund |
| Older investment records | 27 | 23 have no matching current investment |
| Client contacts | 16 | fund-team and client people |
| Sales/marketing contacts | 3,518 | imported from HubSpot |
| Cap-table stakeholders | 8 | equity holders |

Only the person record, investment profiles and current investments are linked to each other. The others repeat names and emails, so a change in one place doesn't show up in another. That's how six investors ended up with a different name on their account than on their person record.

## Is this the slowdown?
Mostly no. The separation causes wrong or stale information, not slow pages. The slowness comes from work that gets repeated:
- **A fund's Investors tab** still recalculates every investor's progress one by one. This is the same problem that used to break Operations → Funds.
- **Opening one investor fund** rebuilds every fund that investor is in, and saving refreshes unrelated sections.
- **Marketing** rescans about 9,500 job records and rewrites imported contacts even when nothing changed.

## Plan
1. **The person record is the single source.** Login profiles, client contacts, sales contacts and cap-table stakeholders each get a link to the person record. The link is filled automatically on a verified exact email match. Anything that isn't an exact match goes to People & Access for review. Name, email, phone and address shown anywhere are read from the person record, so one edit updates everywhere.
2. **Account names follow the person record.** Your six name mismatches will be listed for you to pick the right name, and nothing changes until you choose. After that, the account name stays in sync.
3. **Older investment records stay history only.** They're shown read-only inside the matching investment. The 23 without a match are listed for review. Wire and funding screens stay untouched until that change has its own review.
4. **Speed fixes:**
   - The Investors tab reads the saved progress summaries, like Operations → Funds does.
   - The portfolio rebuilds only the fund being opened.
   - Saves refresh only the section that changed.
   - Marketing skips unchanged records and remembers its last check.
5. **Check:** time the Investors tab, investor fund pages and Marketing before and after, and add tests that one name change shows up everywhere.

## Never changes
- The login account is never the investing party: tax IDs, owners and signers stay on the investment profile.
- Records are linked, never deleted. Duplicates stay read-only with history, and roles and money access aren't affected.

## Technical details
- Add nullable `person_id` to `profiles`, `client_contacts`, `crm_contacts`, `cap_stakeholders` and `ct_stakeholders`, with an index and a backfill on verified exact email. Ambiguous matches go to the existing People & Access review. A read helper `personDisplay(personId)` replaces local name/email reads, and old columns are kept and marked deprecated where they're no longer read.
- Add a `profiles.legal_name` sync from `persons` after the user decides on the mismatches. No automatic overwrite before then.
- Investors tab: switch `fund-tabs.server.ts` per-investor readiness to `onboarding_readiness_summaries`, with bounded stale refresh.
- Scope the portfolio rebuild to the offering. Replace global invalidation with `invalidateFund`.
- Marketing: a cursor on the last job check, plus a hash compare before upsert.
