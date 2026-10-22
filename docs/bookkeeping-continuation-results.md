# Harmonious Bookkeeping & Accounting — continuation review

October 22, 2026

## Decision and safe boundary

The continuation brief requires stopping when independently isolated testing or required access safeguards are unavailable. Those requirements are not currently established. This review therefore verifies the existing draft implementation and records the remaining work; it does not add enrollment, billing, reconciliation or customer financial access against the shared production backend.

No application code, schema, production settings, published pricing, signed agreements, invoices, payment collections, enrollments, bank connections or real client financial records were changed. No authenticated account was used, no customer financial data was queried, and no emails were sent. Only this report and roadmap tracking were added.

## Components completed in the existing implementation

- Internal proposed configuration editor and guided bookkeeping quote form.
- Five tiers with monthly, quarterly and annual reconciliation choices.
- Monthly, quarterly and annual billing calculations independent of reconciliation frequency.
- Server-side proposed pricing: quote saves load the recorded configuration version, validate inputs and recalculate amounts instead of accepting the browser's bookkeeping price or quantity.
- Version-bound proposed snapshots containing configuration, inputs, calculated charges and proposed SOW wording.
- Proposed configuration effective dates and a check that the service start does not precede the selected pricing version.
- Application draft blockers and migration-defined database guards preventing proposed bookkeeping quotes from entering approval, sending or signing.

### Verified proposed monthly-equivalent matrix

All values are USD, internal and unpublished; columns describe reconciliation cadence, not billing cadence.

| Tier | Annual reconciliation | Quarterly reconciliation | Monthly reconciliation |
|---|---:|---:|---:|
| Self-Service | $79 | $89 | $99 |
| Essential | $150 | $200 | $250 |
| Growth | $300 | $400 | $500 |
| Professional | $650 | $825 | $1,000 |
| Enterprise | Custom required | From $2,000 | From $2,500 |

Recurring billing uses monthly-equivalent ×1, ×3 or ×12 without a prepayment discount. One-time charges and quoted hourly/report usage are calculated separately. Enterprise has no invented financial-account allowance; custom scope must be documented. Proposed entity names are scope descriptions, not verified legal-entity IDs or access grants.

Self-Service has no managed review or completion guarantee. Managed monthly targets are 20/15/10/7 business days for Essential/Growth/Professional/Enterprise; quarterly is 20 and annual is 30 business days after the later of period end and required-record receipt. The current helper excludes weekends only; it is not a complete fiscal-period scheduler or holiday calendar.

## Components still pending

| Area | Remaining work and blocker |
|---|---|
| Enrollment | Canonical client/legal-entity links, executed-SOW and exact coverage checks, lifecycle transitions, overlap resolution and append-only history. Requires reviewed entity-access design and isolated QA. |
| Reconciliation | Fiscal-year-aware monthly/quarterly/annual periods, preparation, independent review, supporting-document approval gates and reviewed-report release. Existing accounting audit gaps must be resolved before customer access. |
| Billing | Integrate prospective contracted snapshots into the existing billing engine; first-invoice deduplication, one-time/usage ownership, amendments, upgrades/downgrades and effective-period rules. Keep live issuance and collection disabled. |
| Client views | Entitled subscription details, schedules, private financial uploads, progress and approved reports only. No new customer access until exact-entity safeguards are tested. |
| Portfolio views | Explicit company-financial authorization with revocation and cross-tenant denial; portfolio ownership must never imply financial access. |
| End-to-end QA | Quote save/read-back, acceptance/execution, enrollment, amendments, document approval and report release on fictional isolated records. Currently blocked. |

## Database changes

**This continuation: none.** The existing repository migration defines:

- `bookkeeping_config_versions`: proposed-only configuration versions, explicit service-role grant, RLS enabled and update/delete rejection.
- `sales_quote_lines.bookkeeping_snapshot`: version-bound proposed scope and calculation snapshot.
- `bookkeeping_configuration_immutable`, `bookkeeping_proposed_quote_gate` and `bookkeeping_proposed_line_gate`: append-only configuration and draft-only quote guards.

These definitions were inspected locally. Earlier implementation notes reported deployment confirmation; deployed schema, grants and trigger behavior were not re-queried or independently tested in this review. No new enrollment tables or reconciliation schedules were applied.

## Tests performed and results

| Offline suite | Result |
|---|---:|
| Bookkeeping model | 48 passed |
| Sales model | 5 passed |
| Invoice schedule model | 10 passed |
| Sales acceptance model | 7 passed |
| QA safety | 6 passed |
| **Total rerun** | **76 passed; 0 failed** |

Bookkeeping checks cover the 15 tier/cadence combinations, billing multipliers, included allowances, all 10 proposed add-on rates, transaction/account overages, one-time versus recurring/usage separation, custom Enterprise scope, duplicate rejection, managed deadlines, draft blocking and nonmutation of fictional inputs/configuration. Prior reports of 87 passing checks are historical; 76 checks were specifically rerun here.

The browser harness was invoked with isolation-evidence and QA-origin inputs deliberately unset. It stopped with the required blocked result before backend metadata queries, authentication, browser navigation or fixtures. This proves the missing-evidence fail-closed path, not a positive isolated environment or working authenticated flow.

## Access-control verification

**Source reviewed:** authenticated configuration functions; executive role check before configuration writes; staff/Sales read gate; server-side quote pricing; proposed database RLS/grants and transition guards.

**Offline verified:** existing QA evidence/synthetic-session validation tests and missing-evidence browser stop.

**Blocked/unverified:** deployed direct-write and RLS behavior; quote save authorization and durable snapshot read-back; preparer/reviewer separation; financial-document storage policies; exact entity entitlement; portfolio company permissions; revoked access; cross-tenant allow/deny cases. There are no new enrollment/client/portfolio safeguards to claim as verified.

## Existing functionality regression results

Existing Sales pricing/approval, invoice schedule and acceptance models pass their selected offline regressions. The existing non-bookkeeping rate-card branch remains untouched. No tests wrote existing quotes, contracts or prices. Because real financial records were deliberately not read, this is not a production before/after financial-record comparison. No application changes were made, and no newly modified application build is claimed.

## Outstanding risks

1. No independently isolated fictional backend, reviewed runtime frontend/server binding or classified synthetic sessions are established. A preview URL, draft label or test/demo flag is insufficient.
2. Quote entity references are free-text proposed scope, not canonical entity relationships or authorization.
3. Standalone acceptance handoff can create a draft fund; bookkeeping must not inherit that behavior for unrelated company engagements.
4. First acceptance invoice and recurring first-period billing require one canonical ownership/idempotency rule. One-time and usage calculations in a proposed snapshot do not yet prove complete invoice generation.
5. Existing quote writes use multiple operations; failure recovery and snapshot integrity need isolated server/database testing.
6. Proposed database transition checks need direct-write tests, including snapshot/service-key mismatches, inserts, updates and deletes; unit tests do not establish full deployed coverage.
7. Existing accounting audit findings remain unresolved: summary/posted-ledger divergence, partially applied statements and retries, duplicate-source keys, statement permissions, period/history guards, report limits/date filtering and reviewed client release.
8. Recorded proposed version dates do not yet implement executed prospective amendments, service upgrades/downgrades or preserved historical billing.

## Specific steps before production activation

1. Provision an independently isolated QA project with no production users, records, storage, credentials or connected services. Review copied jobs and production URL references before enabling anything; do not replay data-bearing historical migrations blindly.
2. Independently verify backend identity and actual served frontend plus server binding. Provide reviewed evidence and synthetic staff, independent reviewer, manager, investor and required paid/unpaid account fixtures to the existing preflight. It must pass before authenticated tests.
3. Review canonical legal-entity coverage and deny-by-default access rules for funds/SPVs, standalone entities and explicitly authorized portfolio companies; include revocation, private uploads and report-only projections.
4. Resolve service-critical accounting audit defects through the existing ledger, ingestion, review and reporting engines rather than building a second set of books.
5. Implement inert enrollment/reconciliation/billing infrastructure in reviewed increments, preserving existing quote/SOW and invoice engines, with production activation, pricing publication, invoice issuance and collection disabled.
6. Verify fictional quote-to-enrollment and durable read-back; all reconciliation/fiscal-year cadences; documentation and independent review; billing/amendment calculations; retries/deduplication; upgrades/downgrades; direct database guards and cross-tenant denials. Compare seeded fictional financial records before and after.
7. Obtain separate explicit approval for proposed pricing publication and any production release after reviewing successful end-to-end evidence and unresolved risks. Pricing approval alone does not authorize service activation or payment collection.
8. Review a controlled activation procedure, responsible owners, monitoring and pause/rollback controls without rewriting signed terms, closed periods or issued invoices. Money movement remains outside this integration.

**Conclusion:** Existing draft pricing and selected regressions are offline-verified. Enrollment, reconciliation, billing and client/portfolio financial access remain blocked at the user's requested safety boundary. Passing unit tests do not establish production readiness.