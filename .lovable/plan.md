# Fund Team: multi-fund and "All funds" access

Let staff and fund managers add a team member to several funds at once, or to "All funds" — with new funds automatically included.

## What you'll see

- In the **Team access** box on a fund, the "Add person" form gains a fund picker:
  - **This fund** (default, today's behavior)
  - **Multiple funds** — checkboxes to pick any set of funds you're allowed to manage
  - **All funds** — one option that covers every fund, including ones created later
- Fund managers see "All my funds" (every fund they manage); Operations/Super Admins see "All funds" (the whole platform).
- The team list shows which funds each person covers, and removing access can remove it from one fund or everywhere at once.
- People & Access shows each person's fund-team coverage alongside their other access.

## How it works

- `fund_team_grants` gains a `scope` column: `fund` (one fund, as today), `all_managed` (granter's funds), or `all_funds` (staff only). Existing rows become `fund` — nothing changes for them.
- Scope grants are resolved **at read time**, so a new fund is automatically covered by an existing "All funds" grant without any backfill.
- Every grant still goes through the existing server-side checks: only a manager of a fund (or staff) can grant on it, investors can't be added as team, no self-grants, Viewer/Assistant roles only, and banking/tax/KYC/signing/money permissions remain never-grantable.
- Every grant, change and removal is logged in the existing append-only `fund_team_grant_events` and appears in the fund's Audit History.
- Multi-fund adds create one audited grant per selected fund; a partial failure reports which funds succeeded.

## Technical details

- Migration: add nullable `scope` text column (default `'fund'`) to `public.fund_team_grants`, relax the unique constraint to include scope, comment the column. No data destruction.
- `src/lib/fund-team-access.ts`: scope types + eligibility rules (staff-only `all_funds`; manager `all_managed`).
- `src/lib/fund-team-access.functions.ts`: `grantFundTeamAccess` accepts `fundIds[]` or a scope; `liveGrants`/`listMySharedFunds`/`getSharedFund` resolve scope grants against current funds at read time; revocation can target one fund or the whole scope grant.
- `src/components/fund-team-access-box.tsx`: fund picker UI (this fund / multi-select / all funds) and per-fund coverage display.
- People & Access directory surfaces each person's fund-team grants (read-only summary).
- Tests: extend `src/lib/fund-team-access.test.ts` for scope resolution, auto-include of new funds, staff-only all-funds, and multi-fund grant auditing.
