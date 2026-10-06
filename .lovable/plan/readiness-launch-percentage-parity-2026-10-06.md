# Readiness launch percentage parity

## Finding

The wiring requested is already in place in the current code — verified by reading the sources:

- **Readiness page** (`src/components/investment-readiness.tsx`, `FundLaunchCard`) loads tasks and launch conditions via `getFundLaunchSteps` and computes the percentage with `fundSetupSummary` from `src/lib/fund-launch-summary.ts`.
- **Fund Setup** (`src/routes/_authenticated/ops.fund-setup.$fundId.tsx`) loads the same two tables via `getStaffFundSetup` with identical filters (blocking tasks, required conditions) and the same `fundSetupSummary` math.
- **Fund lists** (Operations funds, manager funds, client funds) use `fundLaunchPercents` in `src/lib/fund-launch-percent.server.ts`, which also calls `fundSetupSummary`.

All four surfaces share one function and the same underlying rows, so the percentages cannot drift in the current build.

## Plan

1. Publish the app so the live site (ops.harmonious.co) runs this build — the published site may still be on an older build where the pages counted differently.
2. After deploy, open one real fund and confirm the same percentage appears on:
   - Fund Setup (setup tab header)
   - Manager Readiness page (Fund launch card)
   - Operations Funds list and the client/manager fund lists
3. If any surface still shows a different number after the deploy, report which one and I will trace its data source.

## Technical details

- No code changes needed; the shared calculation is `fundSetupSummary({ tasks, conditions })` → `percent = round(done/total * 100)` over blocking setup tasks + required launch conditions.
- Only action is a publish plus a visual verification pass.
