# Diagnostic repairs — phase 1

## Scope and verification boundary
Implemented only the five diagnostic repairs and a fail-closed preflight using existing systems. No new database tables, integrations, issue queue, audit store, autosave system, migrations, dependencies, or schedules.

On October 21, 2026, `lovable supabase info --json` reported **production**, no development instance, and the known production backend. `lovable drafts status --json` reported that this checkout is not a draft. Consequently actual QA separation is **not established**. No authenticated browser or mutating test was run. No sessions were minted. No messages, identity checks, signing requests, payments or live replays were triggered.

## Exact files changed / existing functionality reused

### Existing readers and views repaired
- `src/lib/ops-health.functions.ts`: existing email/webhook readers reject database failures; webhook processing is separate from identity/signature business status; arbitrary error text withheld.
- `src/components/ops-health.tsx`: existing loading/empty views retained; failures use existing `LoadError` and Retry.
- `src/lib/audit-log.functions.ts`: existing lookup and money/check multi-source readers fail closed; shared filtering replaces before/after serialization; unrestricted notes excluded from diagnostics.
- `src/lib/fund-audit.functions.ts`: existing exact-fund authorization and aggregated history retained; every contributing read checked and nested values filtered.
- `src/lib/fund-audit.server.ts`: existing audit producer uses shared structured-value filtering; canonical staff notes remain recorded but withheld by the reader.
- `src/lib/captable-audit.functions.ts`: existing tenant-scoped audit reads checked; nested changes filtered and unrestricted reasons withheld.
- `src/components/audit-log-table.tsx`: existing Retry reused; failed/stale records cannot be downloaded as a successful current result.
- `src/routes/_authenticated/admin.audit.tsx`: failed fund-filter lookup is not an empty list.
- `src/routes/api/public/webhooks/didit.ts`: rejected identity callback no longer logs raw body or signature-debug material; processing/replay untouched.
- `src/lib/email-delivery.functions.ts`: authorization precedes service/privileged imports; raw payload and unrestricted response text no longer returned. Global managers are denied these recipient-wide diagnostics; existing onboarding-scoped investor email history remains their read path.
- `src/lib/marketing-jobs-model.ts`: pure display-only one-hour stale-run predicate; existing publishing lateness rule unchanged.
- `src/lib/marketing-jobs.server.ts`: existing run ledger read includes older unfinished runs; recorded outcomes are never updated by diagnostics.
- `src/lib/marketing-studio.server.ts`: job-read failure preserved rather than converted to an empty success.
- `src/routes/_authenticated/marketing_.studio.tsx`: stale counts alongside actual recorded outcome; distinct failed-read state.

### QA and focused verification
- `e2e/helpers.ts`, `playwright.config.ts`: existing browser harness uses centralized preflight and throws for missing sessions.
- `e2e/access.e2e.ts`, `e2e/account-kyc.e2e.ts`, `e2e/saas-cap-table.e2e.ts`: removed missing-session silent skips.
- `e2e/qa-safety.ts`, `e2e/global-setup.ts`: reviewed isolation evidence must agree with actual backend metadata, frontend binding, synthetic account classification and reviewer role before navigation. Unknown/proxied frontend binding blocks conservatively. Positive isolated-backend execution remains untested.
- `vitest.diagnostics.config.ts`, `src/lib/diagnostics-offline.setup.ts`: dedicated targeted config, no application/Vite environment plugins; fetch and Node network connections fail immediately.
- `src/lib/diagnostic-filter.ts`, `src/lib/diagnostic-read.ts`, `src/lib/email-diagnostic-access.ts`: small reusable helpers, not new systems.
- `src/lib/diagnostic-filter.test.ts`, `src/lib/diagnostic-read.test.ts`, `src/lib/diagnostic-handlers.test.ts`, `src/lib/diagnostic-audit-readers.test.ts`, `src/lib/diagnostic-identity-callback.test.ts`, `src/lib/email-diagnostic-access.test.ts`, `src/lib/email-diagnostic-boundary.test.ts`, `e2e/qa-safety.test.ts`; extended existing `src/lib/marketing-jobs-model.test.ts`.
- `AGENTS.md`, `roadmap.md`, this report: safety conventions, task status and review evidence.

## Checks actually performed
- **39 tests passed across nine files** using `bunx vitest run --config vitest.diagnostics.config.ts`; network connections blocked, source handlers mocked.
- Covers failed reads, webhook receipt versus processing, nested/array sensitive fields, unrestricted free text, manager denial before privileged imports, identity rejection logging, stale display without mutation, production/missing QA evidence and missing/mismatched sessions.
- Direct preflight execution returned **BLOCKED: reviewed QA evidence and an explicit QA origin are required; no browser tests ran.**
- Harness compiler status: build OK after diagnostic repairs. This is not authenticated UI verification.
- Read-only deployed function, schedule, timezone, policy and aggregate queries performed for retention; aggregate job query found 24 runs still marked running for over an hour, oldest October 10. No run was reclassified or rerun.

## Blocked / untested
- Real isolated QA identity and data separation, authenticated reviewer/manager/investor walkthroughs, rendered failure/retry UI and actual recipient reads.
- Positive global preflight through an isolated backend and synthetic sessions; provider production delivery behavior.
- Entire unit suite, live webhook processing/replay, payment/submission atomicity, draft persistence and general telemetry. These were not executed.

## Retention — separate proposed correction, not executed
Deployed `public.purge_security_events()` deletes page views older than **12 months** and every security event older than **7 years**. It sets `app.security_retention=on`, which the deployed `public.block_security_event_mutation()` uses to permit deletes. The active `purge-security-events` job invokes the function daily at **03:17 GMT/UTC** (`17 3 * * *`).

Source: `drizzle/migrations/0103_account_security.sql`. Approved policy source: `drizzle/migrations/0170_seed_retention_policy.sql`; deployed `compliance_records` RS-003 and RS-005 version 1 remain approved. RS-005 retains audit logs for platform life; standing policy requires human-reviewed disposition and legal/regulatory hold checks. The purge has neither review nor hold check.

At the read-only snapshot, `security_events` had **2,620 rows**, with **zero currently eligible** under the deployed purge criteria. This does not establish whether older rows were previously purged.

**Proposal for separate approval:** preserve all current rows; replace this automatic destructive function with a nondestructive retention-review projection into the existing compliance disposition workflow, with approved record-family mapping and hold checks. Remove automatic deletion authority only in that separately approved release. If the scheduler is retained, it should produce review candidates only. Before applying, verify function grants/dependencies, all callers, disposition ownership, and the intended classification of session/page-view evidence. No retention function, trigger, record or schedule was changed in phase 1.

## Remaining risks and smallest next phase
1. Provision/prove an independently isolated QA backend and synthetic reviewer sessions, then run existing signed-in tests and the failed-read/authorization walkthrough. Do not treat this preview or demo-tagged production rows as isolation.
2. Next repair phase: webhook failure recovery using existing receipt tables and canonical processors; independently verify event state, replay idempotency and notification dependencies first. No payment/draft changes bundled with that phase.
3. Separately review retention correction. Provider-message association and fabricated diagnostic headers remain known issues outside this phase; raw payloads are withheld now.