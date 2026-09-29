# Role-based dashboards (Operations, Fund Manager, Investor)

Upgrade the three existing home pages into dashboards built only from records each person is already allowed to see. Nothing new is invented: no fake history, no estimated assets figure, and a reported wire never counts as funded.

## What each person will see

**Harmonious Operations (Operations home)**
- A **Needs Attention** panel at the top, with counts for: Needs Harmonious, Waiting on Investor, Waiting on Fund Manager, Agreement Follow-Up, Identity/Entity Review, Related Person Review, Document/Signature Review and Funding/Reconciliation. Each count opens the matching existing queue or filtered list.
- Headline numbers: Active Funds/SPVs, Total Investors, Onboarding, Ready to Fund/Close, Needs Harmonious and Funded. Each one is clickable.
- Four charts: an onboarding funnel (Invited → Started → Verification → Sign → Funding → Complete), readiness by state, capital status (Intended vs Awaiting Funding vs Reconciled Funded) and client agreements (Complete / Follow-Up / Setup Needs Review).
- An onboarding trend chart for 30 days, 90 days or 12 months, drawn only from events that were actually recorded. If there isn't enough history yet, it shows an explanation instead of a chart.
- The existing fund table stays, with extra Funded, Agreement and Next Action columns.
- Filters for Client, Fund, Fund Manager and time range. The server applies these filters.

**Fund Manager (per fund)**
- A **Needs Your Attention** panel first. If nothing needs the manager, it says "You're caught up". No tasks are created just to fill it.
- Headline numbers: Investors, Onboarding, Needs Investor, Needs Me, Ready and Funded, plus Intended Capital and Funded Capital, each with a clear definition.
- Charts: the onboarding funnel, investor readiness and capital progress. Capital progress is shown against a target only if the fund actually has one on record. Clicking any chart segment filters the fund's investor roster.
- A Recent Investor Activity list in plain wording, with no screening, identity, tax or internal notes.

**Investor**
- The **Next Action** card with a Continue button is the most prominent thing on the page.
- Below it: Your Investment (fund, profile, amount, stage) and progress through the 4 steps: About You → Verification → Sign → Fund.
- Investors with more than one investment also see a portfolio summary (Investments, In Progress, Funded, Needs Your Attention) and a list of their investments.
- Each investment shows its funding state: Not Ready, Ready to Fund, Funding Pending or Funded. Funded appears only after the money has been reconciled.
- No performance charts, because there's no real performance data yet.

## Rules applied everywhere
- Every number is defined once, calculated on the server and reused by all three dashboards. Readiness, onboarding stage, funding and agreement status come from the existing readiness checklist, onboarding and agreement status. No second system is created.
- While data is loading, the page shows placeholders instead of zeros. It also tells apart three cases: a real 0, "Data unavailable" and "Not applicable". Every chart has visible labels, a text version and keyboard- and tap-friendly drill-down, and never relies on colour alone.
- On phones, headline numbers use a compact grid, charts fit the screen width, and action lists become stacked cards.

## Technical details
- New pure module `src/lib/dashboard-metrics.ts`: metric definitions and the funnel, readiness-bucket, capital and agreement aggregations. Its inputs are `computeReadinessFor` results, onboarding rows, reconciled funding records and `commercialAgreementStatus`.
- New `src/lib/dashboards.server.ts` with `opsDashboard(ctx, filters)`, `managerFundDashboard(ctx, fundId)` and `investorDashboard(ctx)`, reusing `assertStaff`, exact-fund manager scoping and the person→profile→investment lookups. Batched queries and bulk `.in()` fetches avoid N+1; the existing `opsFundsDashboard` loop gets folded into the shared aggregator.
- `src/lib/dashboards.functions.ts` exposes these as `requireSupabaseAuth` server fns validated with zod.
- Charts use the recharts/shadcn chart already available. Drill-down uses route search params on the existing `/ops/funds`, readiness queue and fund investor roster pages, filtered by the same bucket functions so the counts match.
- Trend data comes only from recorded `investment_readiness_events` and onboarding timestamps. Funded requires reconciled funding (`funding_status = 'funded'` from reconciliation), never a wire the investor reported.
- No migration is expected. Any index that turns out to be needed will be reported before it's added.
- Tests cover role authorization, cross-fund isolation, KPI/funnel/readiness/funding counts, funded requiring reconciliation, agreement counts, clients not seeing agreement internals, investors seeing only their own investments, drill-down counts matching dashboard counts, empty vs zero vs unavailable, and a trend that uses real history only. After that: the full suite, typecheck and build, then a read-only browser check on desktop and phone.
- Out of scope: no production records, emails, money movement or Close Requests. The full QA walkthrough stays in the separate QA copy.
