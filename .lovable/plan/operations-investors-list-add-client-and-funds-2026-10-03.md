# Operations Investors list: add client and funds

## Goal

The Operations → Investors page currently lists each investor with only their name, email and investor type. Turn it into a table that also shows which client each investor belongs to and which funds they're invested in.

## What changes

**Investors table columns:**
- Investor (name, with email underneath) — links to their existing investor record page
- Client — the client company whose fund they're in (links to the client record)
- Funds — the fund names they hold a position or onboarding in (each links to the fund record); shows a count when they have several
- Type — individual / entity, as today
- Stage — their furthest onboarding stage (e.g. Funded, Signed)

**Search:** the existing search box also matches client and fund names, not just the investor's name.

**Behaviour:**
- An investor in several funds under different clients shows each client and fund, comma-separated.
- Investors with no fund yet show "—" for client and funds rather than disappearing.
- Clicking a row still opens the existing investor record page; nothing about that page changes.

## Technical details

- Extend the `investor` branch of `listRecords` in `src/lib/ops-records.server.ts`: after loading profiles, load their `investor_onboardings` (offering_id, stage), the matching `offerings` (name, client_id) and `clients` (name), and attach client/fund names per investor. Search filtering happens after the join so client/fund names match too.
- Update the investor list rendering in `src/components/ops-record.tsx` to a table with the new columns and record links (`recordPath`). Other record types (client, fund, company) keep their current look.
- Keep the existing `gateRecord(context, "investor")` permission check — no change to who can see the page.
- Add unit tests for the grouping/join logic (investor with multiple funds, investor with none).
- No schema changes; read-only.

## Verification

- `tsgo` typecheck and unit tests pass.
- Sign into the preview, open Operations → Investors, and confirm the table shows client and fund names and the links work.
