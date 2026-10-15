# Fund-name search in People & Access

Make the People & Access search bar ("All users" / "Everyone else") match fund names as well as names and emails, so typing a fund shows everyone connected to it.

## Current state (verified)
- The search lives in `src/components/people-directory.tsx` (placeholder "Search name or email"). It matches only `name` and `email` on people rows and invites.
- The directory loader, `directory()` in `src/lib/user-access.server.ts`, already fetches `fund_team_members` and `fund_team_grants` per user, but keeps only counts — no fund names.
- `fund_invitations` rows carry `offering_id`, so pending fund invites can also be matched to a fund.

## Changes

1. **`src/lib/user-access.server.ts` — add fund names to directory data**
   - In `directory()`, fetch `offerings` (id, name) once and build an id → name map.
   - For each person row, add `funds: string[]`:
     - fund names from their `fund_team_members` offering ids;
     - if they have an active `fund_team_grants` row with scope `all_funds` or `all_managed`, add the marker `"All funds"` so they surface for any fund search.
   - Existing extra fields pass through `directoryInsights` untouched (it spreads the row), so no change is needed there.
   - For each `fund_invitations` row in the invites list, add `fundName` from the same map.

2. **`src/components/people-directory.tsx` — extend search matching**
   - People filter: also match if any string in `p.funds` contains the query.
   - Invites filter: also match `fundName`.
   - Update the placeholder to "Search name, email or fund".
   - When the query matches at least one fund, render a light helper row of clickable fund chips (name → `/ops/funds/<id>`) above the table, so a fund search can also jump straight to the fund. Chips only appear when a fund name actually matches; no new data fetch — the chip list comes from a `offerings` list the directory payload already gains in step 1 (`fundOptions: { id, name }[]`).

3. **Authorization unchanged** — no new server functions or policies; `directory()` already runs behind `requireAccessViewer` and the new offerings read is scoped to the same request.

## Tests
- Add/extend a unit test in `e2e`-independent test style used for user-access (follow existing tests in `src/lib/*.test.ts`) covering: fund-name match on people, "All funds" marker, invite fund-name match, and chip listing.
- Typecheck and confirm the preview build is clean; the People & Access page loads and filtering works with a fund name typed in.
