## Files
**Edited**
- `src/lib/investor-onboarding.server.ts`: add `loadReadinessInputs(rows)` and a pure `factsFromInputs(row, inputs)`. `gatherFacts(row)` becomes load `[row]` then compute. Add `readinessForMany(rows)`. `computeReadinessFor(row, closeAmountCents)` keeps its signature and output.
- `src/lib/onboarding-compliance.server.ts`: split `resolveStage2` the same way (a batch loader for offering rules, tax facts and forms, questionnaire responses, certifications and covered roles, plus a pure resolve step). The existing export stays as a wrapper around one row.
- `src/lib/prepared-investor.server.ts`: add `loadProvenanceMany`; `loadProvenance` and `loadConfirmedFacts` call it with one row.
- `src/lib/prior-subscription.server.ts`: reuse the existing `latestPriors(ids)`, which already takes a list.
- `src/lib/ops-funds.server.ts`: replace the batches-of-20 loop with `readinessForMany(onbRows)`. Large ID lists are split into chunks of 100 IDs, with at most **4** chunks queried at once (down from 20 concurrent calls).

**New**
- `src/lib/readiness-batch.test.ts`: builds an in-memory fake database with several investors (individual, entity with related people, signed docs, stale snapshot, open exception, prior subscription, no profile). It checks that `readinessForMany(rows)` returns the same result (`result` plus `facts`) as `computeReadinessFor(row)` for each row, using a fixed `nowIso`. It also counts calls on the fake to show that batch reads don't grow with the number of investors.

**Unchanged**
- `dashboards.server.ts`, `investor-record.server.ts` and `reconcileInvestmentReadiness` keep calling `computeReadinessFor`.

## Safety
- Read-only. No migration, no data writes, no change to readiness rules.
- `loadConfirmedFacts` keeps its current behavior on failure (empty facts). Batch reads keep the same column and filter conditions as today.

## Measuring
Before editing, I'll add a temporary in-memory query counter to `db()` in a local probe script under /tmp (not in the app). It will run `opsFundsDashboard` read-only against the 136 onboardings and print the real call count and time. I'll run it again after the change and report both numbers.

## Not covered
- Other slow paths from the review (CRM rewrites, missing indexes, unchecked errors).
- `fundLaunchPercents` and agreement lookups, which are already batched.
