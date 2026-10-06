# One fund, one set of facts across Ops record, Fund Setup and Readiness

## Goal
The Operations fund page, Fund Setup and the manager's Readiness page should show the same numbers and the same investor statuses. Each item should be entered in one place only.

## What overlaps today
1. **Investors:** they appear three different ways. The Ops fund Investors tab shows a raw list. Fund Setup shows the investor grid with KYC, documents and wire status. Readiness shows readiness buckets and next steps. Each uses its own labels.
2. **Setup progress:** it's worked out three separate ways, so the percentage and steps can differ.
3. **Setup checklist:** it appears in two forms on Fund Setup, plus a third read-only step list.
4. **Fund details:** they're edited on Fund Setup but shown from a separate copy, so a change can take time to appear elsewhere.
5. **"Ready":** "launch ready" for the fund and "ready" for each investor sound alike but mean different things, and nothing links them.

## What changes
- **One investor view everywhere:** the Ops fund Investors tab uses the same investor grid as Fund Setup. The grid gains a "Readiness" column with the next step and who owns it, from the same rules the Readiness page uses. Readiness keeps its summary cards, and each row there links to the same investor record.
- **One progress number:** the Ops page header, Fund Setup and the fund workspace all show the same setup percentage and blockers from a single source.
- **One checklist:** only the task list shown inside each Fund Setup section remains. The separate checklist and the duplicate step list are removed. Each step links to the section where it gets done.
- **Fund details:** they're read from the same data Fund Setup edits. A save updates every page immediately.
- **Clear launch link:** Fund Setup's Launch section shows investor readiness counts and a link to the Readiness page. Readiness shows the fund's launch status at the top. The two kinds of "ready" are labelled "Fund launch" and "Investor readiness".
- **Inputs stay in one place:** investor edits happen in the investor record. Fund facts are edited in Fund Setup. Other pages link to those places instead of offering their own inputs.

## Not changing
- Who can see or edit what. Each page keeps its own server checks. Fund managers still see only their own funds.
- Approval, KYC, signing and funding rules.

## Technical details
- Add a shared `getFundProgress(offeringId)` in `src/lib/fund-progress.server.ts`, used by `ops-records.ts` (fund summary), `getStaffFundSetup` and `getClientFund`.
- In `ops-record.tsx`, render `InvestorsTab` for `type="fund"`, tab `investors`, instead of the generic table.
- Merge readiness bucket and next action from `investor-readiness` into `investorGridFn` rows. This is a read-only projection.
- Remove the `FundSetupChecklist` branch from `ops.fund-setup.$fundId.tsx` and keep `RequiredHere`/`LaunchRequirements`. Remove the step list in `fund-workspace.tsx`.
- Point the `fund-workspace.tsx` details tab at `getFundSetupOverview`. Invalidate a shared query key on setup saves.
- Add a cross-link card on the Fund Setup Launch section and a fund launch badge on `FundReadiness`.
- Add an AGENTS.md rule: fund progress and the investor grid each have one source.
