# Diagnostic QA provisioning review — October 21, 2026

Phase one accepted as **offline-verified only**, pending independently isolated authenticated validation. Not fully verified or client-ready. This review changed only tracking/documentation, not application code or production configuration.

## Observed provisioning options

Read-only `lovable supabase info --json` reconfirmed a production backend, no development instance. `lovable drafts list --json` reports Investor reviewer QA, QA test access and Platform Architecture Overview all have `isolated_backend:false`. Current checkout is not a draft. These drafts are reusable code work, not safe environments.

Official docs: drafts share live backend data and settings. The old Test/Live feature is unavailable for new projects; documentation does not establish an enablement path for this existing production-only project. No available CLI or loaded provisioning tool offers a safe development-backend enable operation here.

### Smallest documented option: separate Cloud remix

Project settings → Project actions → Remix (or dashboard project-card menu → Remix); choose QA name/workspace. Docs say the copy has a separate built-in backend, copies code/database structure but not database records, users, secrets, custom domains or service connections; unpublished by default. No general paid-plan prerequisite is documented; workspace access/Enterprise transfer restrictions apply.

**Not yet proven safe to provision unattended:** docs do not establish whether copied cron schedules/jobs start at creation. Production URLs and data-bearing migration literals remain in copied source. Do not automatically run old migrations or seed scripts, connect production services, or open copied workflows. Creation alone is not evidence of a fictional-only environment. Verify empty records/auth/storage, scheduler state, origins and integration isolation before any QA use.

Fallback if inert remix creation cannot be established: a fresh Cloud project with reviewed schema/policy-only migration inputs and selected application code, no historical literal production rows, production exports, users, storage or manually configured credentials. More setup than remix but allows explicit schema/fixture review. No provision/remix performed in this review.

### Costs and manual prerequisites

Cloud is usage-credit based (compute/storage/network/database activity); current docs describe a shared 20-credit monthly Cloud grant, subject to change. No fixed QA price or quote is verified. Provisioning/build usage can consume credits. Review measured costs in More → Usage. Manual work: create separate project; review copied jobs/settings and code-origin references; seed fictional records; create synthetic accounts and authoritative roles; satisfy existing policy/identity/security gates without bypassing them; capture isolation evidence and sessions in the new project's context. No production personal data or credentials copied.

## Reuse versus provision

Reuse `e2e/global-setup.ts`, `e2e/qa-safety.ts`, `e2e/helpers.ts`, `playwright.config.ts`, existing diagnostic readers, `LoadError`, focused offline suites and fictional conventions in `src/lib/reference-fund/walkthrough-source.ts`. The latter is not an account provisioning script. `package.json` has no QA seed/provision task.

Provision one fictional administrator reviewer (admin/super_admin for recipient-wide diagnostics), manager and investor, fictional client/fund and canonical relations, `profiles.is_test_demo` classifications and required gate records. Include a second fictional fund/application and distinct messages sharing a fictional recipient for association checks. Stale/completed job rows and nested sensitive sentinel audit values must be fictional and inert, not executed jobs.

The **unchanged** global setup requires six session inputs: staff, manager, investor, unverified, paid-cap-table and unpaid-cap-table. Six separate fictional accounts are the smallest conservative option that reuses the harness without changing it; a three-account diagnostic-only preflight would require a separately reviewed harness change. Cap-table states are fixtures only, never real charges.

## Isolation and validation sequence

1. Confirm backend identity differs from production and runner metadata points to the separate QA project. Inspect empty users, application records/storage, jobs, connectors and source literals; allow fictional fixtures only.
2. Before authenticated navigation, inspect served client configuration/artifacts to verify actual frontend binding and independently check server binding. In a draft proxy, establish the proxy's target rather than assuming hostname identity. Runner `VITE_SUPABASE_URL` alone is **not** runtime proof; current preflight checks that variable, so external reviewed binding evidence remains necessary.
3. Create approved synthetic sessions in the isolated project's context; verify authoritative backend roles/relations, not claims alone. Provide reviewed evidence (origin/backend/reviewer/date/synthetic allowlist) to existing preflight; absent or inconsistent evidence blocks.
4. Only after preflight passes, perform authenticated failed-read/Retry, recursive audit filtering, administrator-versus-manager recipient authorization and display-only stale-job tests. Exercise failure through read-only test-scoped interception, not by breaking production permissions. Confirm UI read-back and record passed/failed/blocked per case. No production messages or resolution notices.

## Current result register

**Passed:** read-only environment/draft inventory; source dependency review. Prior 39 offline tests remain offline evidence only, not a new authenticated pass.

**Failed:** no authenticated checks were attempted, so no authenticated test failures reported. Existing email defects are confirmed source findings, not failed live tests.

**Blocked:** provisioning safety of cron activation during remix; independently isolated backend/fictional records; actual served frontend and server binding; positive preflight with synthetic sessions; all four authenticated diagnostic workflows. Current environment preflight blocks before navigation. No safe QA URL yet.

## Explicit deferred defects

- **Email-message association:** `src/lib/email-delivery.functions.ts:91-126` independently chooses the latest send, recipient-wide event and provider log; applicationId filters only the send. `:129-156` can combine another message's ID/response with this send's subject/date. Need exact-message joins/provenance, not consolidation by recipient. Unrepaired.
- **Hardcoded headers:** same file `:130-140` supplies literal From/domain/Purpose and inferred Subject/Date; `src/components/application-review.tsx:1117-1119` labels these Message headers. Not captured transport headers. Unrepaired.
- Existing `src/lib/investor-emails.server.ts:90-96` provider lookup inserts discovered sends/events; exclude from a read-only walkthrough. Retain existing scoped read history instead.

Webhook recovery, payments, draft persistence, retention and email provenance repairs remain outside this validation phase.

Sources: https://docs.lovable.dev/features/drafts ; https://docs.lovable.dev/features/projects/remix ; https://docs.lovable.dev/features/cloud ; https://docs.lovable.dev/changelog ; https://docs.lovable.dev/features/project-usage ; https://docs.lovable.dev/features/jobs . Documentation inspected October 21, 2026; undocumented creation-time scheduler behavior not assumed.