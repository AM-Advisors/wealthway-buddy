# Portfolio Reporting & Analytics: phased plan

A consolidated portfolio view built on the existing Wealth dashboard, fund records and investor reports. No new outside services, no new costs, no service pricing.

## What already exists (reused, not duplicated)

- **Wealth dashboard** (Wealth page): personal assets you enter yourself, fund investments, recorded debts, and fund contributions and distributions that have actually been received or paid. Only the owner can see it.
- **Personal account connections**: built but running in **test mode only**. Their balances are already left out of totals. Nothing will be shown or described as a live bank or brokerage feed.
- **Fund holdings and marks**: fund portfolio assets with reviewed valuations, valuation methods and evidence, plus monitoring on the manager and Operations Portfolio pages.
- **Investing parties**: trusts, LLCs, IRAs, partnerships and other entities kept separate from the login, and each investor's position in each fund.
- **Fund cash records**: capital calls per investor, distributions per investor, a dated commitment history, and published capital accounts.
- **Return calculations**: an existing, tested engine for money-weighted return (XIRR), multiples (TVPI, DPI, RVPI, MOIC) and time-weighted return. It reports "not enough data" instead of guessing.
- **Investor portal reports**: published packages, capital statements and documents, all shown only to the right investor. Existing PDF and CSV tools.
- **Report Cards, permissions, import previews** (investor import), audit histories, and the fictional QA sandbox.

## Phase 1: what gets built (after approval)

1. **Consolidated portfolio** (new "Portfolio" tab on the Wealth page)
   - Total value, holdings, allocation, cash activity and the date of each value.
   - Every row is labeled **Entered manually**, **Imported** or **From fund records**. Connected accounts stay hidden while in test mode.
   - Add holdings by hand or import a CSV.
2. **Ownership and look-through**
   - Record who owns what: you → trust or LLC → fund. Each owner's share of the underlying holdings is shown proportionally.
   - Each asset is counted once. A fund holding is never added again on top of its look-through value.
   - Warnings for incomplete ownership, such as missing percentages or shares that add up to more than 100%.
3. **Private investments**
   - Commitment, paid in, distributions, unfunded commitment, value history and supporting documents for each fund.
   - Fund investments read the existing capital-call, distribution and capital-account records. Outside private investments are entered by hand or imported.
4. **Performance**
   - XIRR and multiples from dated cash flows and values, using the existing engine.
   - Time-weighted return only when there is enough value history.
   - Each figure shows its period and assumptions, with a warning when data is missing. No made-up returns and no benchmarks.
5. **Allocation and liquidity**
   - Breakdown by asset class, sector, region and currency where the data exists. Anything else shows as "Not recorded".
   - Upcoming capital calls and distributions that have already been announced, available cash and unfunded commitments.
   - "Projected" items are kept separate from "Actual" activity.
6. **Quarterly report**
   - Holdings, performance, allocation, cash activity and value dates, with Harmonious branding.
   - Download as PDF or CSV. Once published, each report is a fixed version and appears in the existing secure investor portal.
7. **Data quality and access**
   - Flags for stale values (older than 120 days), missing information and duplicate imports.
   - Imports show a preview and check the file before anything is saved.
   - Every change keeps a history: corrections replace earlier entries and never erase them.
   - Investors see only their own portfolios and their investing parties.
   - Managers see only portfolios they have explicitly been given access to manage.
   - Operations staff see portfolios through the existing reporting permissions.
8. **Demo and tests**
   - Fictional demo data in the QA sandbox only. No real client data.
   - Tests for returns, ownership shares, double counting, import checks and access limits.

## Later phases (not built now)

- Live bank and brokerage feeds, once the account connection is switched to live mode and you approve it.
- Advanced risk analytics, benchmarks, trading and rebalancing.
- Manager-wide summaries across many households.

## External services and costs

- **None required.** Phase 1 uses only what is already in the app.
- Switching personal account connections to live mode would be a separate decision, with the provider's own costs, and is not part of this phase.

## One decision to confirm

**Manager access.** Managers can see a person's consolidated portfolio only when that person grants them access, using the existing delegation records. Being their fund manager does not give access on its own. Fund managers keep seeing their own fund's records as they do today.

## Technical details

- **New tables** (with grants and owner-scoped access rules, all corrections append-only):
  - `wealth_ownership_links`: owner → entity or holding, with percentage, effective date and source.
  - `wealth_holding_attributes`: sector, region, currency and asset class on each value record.
  - `wealth_private_commitments` and `wealth_private_cash_flows`: outside private investments.
  - `wealth_import_batches` and `wealth_import_rows`: file fingerprint for duplicate detection, row checks, preview, then commit.
  - `wealth_report_versions`: published, fixed quarterly snapshots, linked into the investor reporting package and document library.
  - `wealth_audit_events`.
- **Code**:
  - Pure model `src/lib/wealth-portfolio-model.ts` for look-through, de-duplication, allocation, liquidity and staleness.
  - Performance calls the existing `performance-model.ts` XIRR, multiples and TWR functions.
  - Server functions in `wealth-portfolio.functions.ts` with `requireSupabaseAuth`. Access is checked on the server, by owner, investment profile, delegation grant or `reports:see`.
  - Fund figures come from `investor_positions`, `capital_call_lines`, `distribution_lines`, `commitment_events` and published `capital_accounts`. Only posted cash counts as actual; notices count as projected.
- **Reports**: PDF with the existing pdf-lib renderer, CSV with the existing serializer. Published versions go to `/investor-reporting`.
- **QA**: sandbox handlers and fixtures for each new server function. Vitest suites for returns, ownership, double counting, import validation and authorization. A Playwright walk through the fictional sandbox.
