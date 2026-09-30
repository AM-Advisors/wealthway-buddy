# Rework the Operations work areas around how the team works

## What's wrong today
- **13 work areas and about 70 screens.** Most areas are just a page of link cards, so every job costs an extra click to get there and another to get back.
- **Duplicates and overlaps:**
  - Three distribution screens: Distributions, Distributions & payments, Wires and distributions.
  - Banking is split across four places: Banking requests, Bank accounts, Client bank accounts, Wire instructions.
  - Three financial-statement screens: Financial reporting, Statements & reviews, Financial reviews.
  - Two tax screens overlap: Tax documents and Investor tax review.
  - Onboarding appears in several places: Investor onboarding, Readiness queue, Onboarding progress, Onboarding funnel.
  - Clients has pricing in three places: Sales, Pricing and agreements, Rate proposals.
  - "Permissions" and "Access Control" sit side by side.
- **Areas are grouped by record type, not by job.** EIN/SS-4 sits under "Regulatory", while EIN work now lives in Fund Setup. "My clients" and sign-off are hidden in "Tasks & Activity".
- **No area tells you what's waiting.** The landing pages list screens, not the work.

## New structure (8 areas, each tied to a team process)

```text
Home (My work)       what's waiting on me: sign-offs, reviews, aging items
Clients              client list, agreements/SOW, pricing + approvals, invoices
Funds & SPVs         Fund list, Fund Setup (entity, EIN, Form D, banking,
                     documents, launch), document templates, fund access
Investors            directory, onboarding + readiness queue (one screen, tabs)
Money                expected funding, wires/distributions (one screen),
                     bank accounts (fund + client tabs), wire instructions
Accounting & Reports accounting close, valuations/NAV, allocations,
                     financial statements (one screen: prepare/review/approve),
                     capital statements, investor reporting
Tax                  tax workspace (returns, 1065, 1042-S, 1099, K-1 tabs)
Companies            cap tables, requests, plans, migrations
Administration       access control, compliance, team, audit, system health
```

## Area landing pages become work pages
- The top of each landing page shows **"Waiting now"**: counts and the oldest items for that process, with a link straight to each. Aging wording stays as it is ("Waiting N days").
- Below that, the screens are listed in **process order** (for example Prepare → Review → Approve), not alphabetically.
- **"Recent"** remembers the last five screens you opened, one click each.

## Merges (links only, no data changes)
- Old addresses redirect to their new home, so bookmarks keep working.
- Duplicate screens become tabs on a single screen wherever they show the same records.
- Screens that genuinely differ stay separate, but get renamed so the difference is clear.

## What stays the same
- Who can see or do what: every area and screen keeps its current access check.
- Maker-checker steps, approval rules, and the record-only rule for filings and money.

## Technical notes
- `src/lib/ops-capabilities.ts` is where OPS_WORK_AREAS gets regrouped; the capability names stay the same.
- `ops.areas.$area.tsx` gets a "Waiting now" panel that reuses the existing queue/count server functions (read-only).
- Redirect routes cover retired URLs, and screens that belong together become tabs.
- Update the sidebar and navigation tests, plus the search index.
