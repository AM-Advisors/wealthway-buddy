# Speed up the Funds dashboard (readiness batching)

## Problem
`opsFundsDashboard` (src/lib/ops-funds.server.ts) calls `computeReadinessFor(row)` once per active onboarding, 20 at a time. Each call runs about 25 database reads:

- `offeringRequirements`: 3-4 (offering, requirements, setup, eligibility config)
- `gatherFacts` direct reads: about 10 (person, profile, entity verification, relationships, accreditations, tax profiles, signatures, offering docs, acknowledgments, snapshots)
- `loadConfirmedFacts` / `loadProvenance`: 2
- `resolveStage2`: about 8 (offering rules, tax facts, tax forms, bad-actor and AML responses, certifications, onboarding row, covered roles)
- `openExceptions` + `confirmedPrior`: 2

With 136 onboardings, one page load runs about 3,400 reads for readiness, plus about 12 fixed reads. These are estimates from the code. I will measure the real numbers before and after.

## Approach: one code path, two loaders
Split `gatherFacts` into two parts:
1. **Load:** a `ReadinessInputs` loader that fetches every table for a *list* of onboardings with `.in(...)` queries and returns maps keyed by onboarding, profile, person, application or offering ID.
2. **Compute:** the existing logic, now a function that reads only from those maps (no database access).

The single-investor path becomes `loadReadinessInputs([row])` followed by the same compute function. There is one implementation, not a copy. Batch is just the same loader called with many rows.

The same split applies inside `resolveStage2`, `loadProvenance` and `latestPriors`. Each gets a batch loader, and its existing single-row export calls that loader with one ID, so existing callers keep the same signature and behavior.
