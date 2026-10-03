# Investor "My Share" view: profits, losses, distributions and a K-1-matched balance sheet

## Goal
Every investor (fund investors and cap-table holders in LLC-style companies that issue K-1s) gets a **My Share** tab showing their portion of the entity's results. Figures update the moment Harmonious approves something (books/NAV, allocations, distributions, K-1s) — nothing unreviewed is ever shown.

## What investors see
1. **Summary cards:** ownership %, contributed to date, profit/loss allocated to date, distributions received, current capital balance.
2. **Charts:** bar chart of profit/loss and distributions by period; circle chart of their capital (contributions, cumulative P&L, distributions).
3. **Capital account statement (balance-sheet style), by year:** opening balance + contributions + share of income/gains − share of losses/expenses − distributions = closing balance.
4. **K-1 match check:** for each tax year with a final K-1, the statement is compared line by line to K-1 Part II item L (beginning capital, contributed, current-year increase/decrease, withdrawals/distributions, ending capital). Shows "Matches your K-1" or the exact difference plus "Harmonious is reviewing" — investors never see raw unreviewed numbers.
5. **Entity balance sheet (their share):** their percentage of the approved balance sheet (cash, investments, liabilities, net assets), with a note that it's as of the last approved period.
6. **Download:** PDF of the statement for any year.

## Where it appears
- **Investor portal** (`/investor/fund/:id`): new **My Share** tab next to Overview.
- **Cap-table holder portal:** same tab on the holder's company view, only for companies set up as partnerships/LLCs taxed as partnerships. Corporations show shares only (no K-1s exist), with a short explanation.
- **Harmonious and fund managers:** an "Investor capital" view on the fund's Investors tab listing every investor's tie status, so mismatches are fixed before investors notice.

## "Approved only" rules
- Only approved sources feed the view: approved NAV/statement packages, posted allocation runs, paid distributions, and K-1s marked final.
- When a new approval happens, the investor's page refreshes on next open (and live if it's open).
- A mismatch with a final K-1 opens a review item for the tax team; investors only see that it's under review.

## Not included
No money movement, no filing changes, no new emails. Investors never see other investors' figures or tax IDs.

## Technical details
- Pure model `src/lib/investor-share-model.ts`: builds per-year capital roll-forward from `capital_accounts`, posted `allocation_lines`, paid `distribution_lines`, `capital_call_lines`; `tieToK1(rollforward, k1Item L)` returns per-line differences (cent tolerance). Unit tests for roll-forward, zero-K-1 years, mid-year entry, mismatch.
- Server fn `src/lib/investor-share.functions.ts` (`investorShareFn`, `capitalTieReportFn`) using `requireSupabaseAuth` from `src/lib/require-auth.ts`; investor scope = caller's own investment profiles on that offering (or `cap_holder_access` for holders); staff/managers via existing fund assertions. Only approved/posted/final rows queried.
- Entity balance sheet share reuses `fund-books-model` over the last approved period × ownership %.
- Mismatch → append-only `capital_tie_exceptions` table (staff-only, RLS + grants), deduped per investor/year.
- UI component `src/components/investor-share-panel.tsx` (recharts bar + pie) shared by investor and holder portals; Investors-tab tie list in fund-workspace for harmonious/manager modes.
- AGENTS.md rule: investor share view is a read-only projection of approved records and must tie to final K-1 item L.
