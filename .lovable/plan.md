# Forecasting for cap tables, portfolios and funds

## What you get

Make this another service and add on. Do not add unless they pay for it.  **Forecasts** tab available to be added on each cap table, portfolio and fund — it appears only once the client has paid for the Forecasting add-on service. Each forecast holds several named scenarios (for example Base, Upside, Downside) that you can compare side by side. Every forecast is clearly labeled **Projection — not actual results** and never changes real records.

1. **Cap table: dilution and future rounds**
  - Add hypothetical rounds: amount raised, pre-money value, price per share, new option pool, SAFE/note conversions.
  - Shows ownership before and after each round, per holder and per class.
2. **Portfolio value**
  - Per holding: expected growth or exit value, exit year, write-down.
  - Shows projected value, MOIC and IRR, starting from the latest recorded value.
3. **Fund cash flows**
  - Projected capital calls, distributions, management fees and expenses by quarter or year.
  - Shows NAV over time, total called, total distributed, DPI/TVPI.
4. **Waterfall and carry**
  - Uses the fund's recorded terms (preferred return, catch-up, carry %) and a chosen exit scenario.
  - Shows distributions to investors versus GP carry.

## Who can do what

- Harmonious staff and the managers of that exact fund or company can create and edit forecasts.
- A manager may **share** a scenario with investors. Investors see only shared scenarios, read-only, with the projection disclaimer. Sharing and unsharing are logged.
- Shared scenarios show totals only — never other investors' names or amounts.
- Each save creates a new version; older versions stay viewable. Nothing schedules calls, distributions or payments.

## Technical details

- Forecasting is a new add-on in the existing Services & Pricing catalog (quotable on quotes/SOWs like other add-ons). The tab is enabled server-side only when that add-on is contracted and paid for the cap table, portfolio or fund; otherwise it is hidden and server functions refuse access. Price to be confirmed by you.
- New tables: `forecasts` (subject type cap_table/portfolio/fund, subject id, name), `forecast_scenarios` (assumptions JSON, shared flag), `forecast_scenario_versions` (append-only snapshot of assumptions and computed results, actor, timestamp), `forecast_share_events` (append-only). RLS + grants; writes only through server functions using existing fund-manager/staff authorization helpers; investor reads through an entitlement-checked server function.
- Pure calculation module `src/lib/forecast-model.ts` (dilution, value/MOIC/IRR, cash flows/NAV, waterfall) with Vitest tests for each rule; reuses existing waterfall terms where recorded.
- Starting points read from canonical records (cap table holdings, latest asset valuations, capital calls, fund terms); forecasts never write back to them.
- UI: shared `ForecastWorkspace` with scenario tabs, assumption editor, comparison table and charts (existing `charts.tsx`), mounted in cap table, portfolio and fund tabs; investor read-only view in investor reporting.
- Record the rule in AGENTS.md: forecasts are projections only and never alter canonical records or trigger money movement.
