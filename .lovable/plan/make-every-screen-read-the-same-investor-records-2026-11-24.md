# Make every screen read the same investor records

## What we know
- All fund and investor information sits in one database. Each investor's information is split across a few connected record types: the investment, the older application record, the investing party, and earlier signed papers brought in from folders.
- 325 active investments: only 10 are linked to an older application record. 30 applications aren't linked to any investment. There are 255 earlier signed papers.
- Signatures, payments and some checklists still use the older application record, so a screen reading only one record type misses information saved in another. This caused Chris Par's error.
- The exact screens affected aren't confirmed yet. That's the first step.

## Steps
1. **Full check (no changes):** For every fund, compare investments, applications, signatures, earlier signed papers, payments and checklist status. List each mismatch, such as "signed but checklist says unsigned" or "an application with no investment", grouped by fund. You get a report spreadsheet.
2. **Find the screens:** List which fund screens, investor screens, checklists and Operations dashboards read only one record type.
3. **One shared reader:** Make those screens use one shared lookup that follows the links between all record types. Signatures and earlier signed papers count wherever they're attached.
4. **Link safe matches:** Connect an application to its investment only when there's exactly one match on the same fund and investing party. Ambiguous cases go on a review list for you, with no guessing. Each link is logged, and no history is changed.
5. **Stop new splits:** New signing, payment and import steps always record both links.
6. **Recheck:** Rerun step 1 and confirm the mismatches are gone or are on the review list.

## Not changing
No emails, signatures, approvals, money movement or access changes. Signed originals and history stay as they are.

## Technical details
- Audit query across investor_onboardings, investor_applications, document_signatures, prior_signed_documents, readiness summaries.
- Shared resolver in src/lib (onboarding to application to profile), reused by readiness, checklists and Ops readers. Then reconcileInvestmentReadiness refreshes the summaries.
- Backfill only unique matches on the same offering and profile, with an audit row for each. Add tests for the resolver and the match rules.
