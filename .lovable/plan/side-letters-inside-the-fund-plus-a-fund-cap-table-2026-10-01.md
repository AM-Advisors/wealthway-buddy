# Side letters inside the Fund, plus a Fund Cap Table

## 1. Side letters listed within the Fund
Right now side letters live on their own tab. They will also appear where people already work with investors in the Fund:
- **Fund Investors list (manager and Operations):** a "Side letter" column showing None, Active with the number of terms, Expiring, or Pending approval. Clicking it opens that investor's side letter.
- **Investor detail page within the Fund:** a Side letter panel showing current terms, MFN scope, expiry and a short history. It has a "Propose change" button that uses the same approval rules (a different person approves). If the investor has no side letter yet, the panel offers to start one.
- **Fund Overview:** a small summary of active letters, letters expiring soon, pending approvals and open MFN reviews, with a link to the full registry.
- The Side Letters tab stays as the full registry, with the approvals and MFN review queues.

## 2. Fund Cap Table (one per Fund)
A new **Cap Table** tab on each Fund (manager and Operations pages). It is built from the Fund's own investor records. It is a view only: nothing is stored or edited here.

One row per investor investment in the Fund:
- Investor name and investment profile (the investing entity, not the login account)
- Class
- Commitment
- Accepted amount
- Funded amount (counts only once the bank match is reconciled, same rule as everywhere else)
- Units (if recorded)
- **Ownership %**, shown two ways:
  - % of total commitments
  - % of funded capital
- **Effective terms:** the Fund's approved class terms (management fee, carry, hurdle) with any active side letter terms layered on top. For example, a fee shows "2.0% (class), 1.5% per side letter." Terms that differ from the class are highlighted.
- Side letter status and MFN flag

The tab also shows:
- Totals by class and for the whole Fund, and a simple ownership chart
- Filters: class, stage (prepared, claimed, signed, funded), and whether the investor has a side letter
- Rules on what counts:
  - Removed and declined investments are excluded.
  - Investments that aren't funded yet count toward commitments only.
  - Expired or terminated side letters fall back to the class terms.
- A CSV export of exactly what is on screen

**Who can see it:**
- Harmonious staff
- That Fund's managers
- Viewers and Assistants the manager has added to the Fund, without tax, bank or identity details
- Not investors. They keep seeing only their own position.

**Kept separate:** the existing company cap tables (for portfolio companies) are a different tool and stay untouched.

## What does not change
- Side letters stay a record only. The cap table shows a term's effect but never changes fee calculations, capital accounts or distributions.
- No changes to production investor, funding or document records.

## Technical details
- **Pure projection:** `src/lib/fund-cap-table.ts`, function `buildFundCapTable(investments, classTerms, sideLetters)` → rows, class totals and the Fund total. Ownership % is calculated in cents to avoid rounding drift, and Funded comes from the existing canonical funding status.
- **Server function:** `fund-cap-table.functions.ts`, `getFundCapTable({ fundId })`. Each call reuses the side-letter permission check (staff, that Fund's managers, live team access). It reads `investor_onboardings` with names from persons/profiles, approved class terms from the existing economics snapshot, and active side letters.
- **Side letter summary:** a `getSideLetterSummary({ fundId })` server function returns each investor's side letter status for the Investors list and the investor detail panel. It reuses `SideLetterRegistry` pieces (detail panel and draft form) by exporting them.
- **New and changed screens:**
  - New route `manager.fund.$fundId.cap-table.tsx`, plus a "Cap Table" link in the Fund menu
  - New "Cap Table" tab on the Operations Fund page
  - Side letter column on the manager and Operations Fund investor lists
  - Side letter panel on the manager investor detail page
- **Rules file:** add to `src/lib/AGENTS.md`: the Fund cap table is a read-only projection of investor records plus active side letters, never stored and never a source for economics.
- **Tests:** ownership math, class totals, funded-versus-committed handling, side letter override and fallback after expiry, exclusion of removed investments, and permission scoping.
