# Harmonious — Bookkeeping Phase 2 isolation and security review

October 22, 2026. Status: **blocked before authentication or financial fixture writes**.

## Required result register

“No” below means not established or not verified; it does not mean a breach occurred.

| Requirement | Yes/No | Verifiable evidence or missing evidence |
|---|---|---|
| QA environment established for this work | No | Current project metadata reports production, no development instance. A separate project named Harmonious QA exists, but its runtime safeguards are unverified. |
| Database isolation verified | No | Current backend is shared production; cross-project checkout provides source only, not the candidate's live backend metadata or contents. |
| Authentication isolation verified | No | No candidate auth settings, empty-user inventory, issuer or separate synthetic authority were verified. No account was created or session minted. |
| Storage isolation verified | No | Candidate bucket ownership, object inventory, privacy and policies were not inspected live. No customer documents were accessed. |
| Production integrations disabled in QA | No | Candidate runtime connectors, secrets, outbound delivery, jobs, webhooks and external destinations have not been proven inert. Production settings were not changed. |
| Synthetic accounts provisioned | No | Stopped before account creation, as required. |
| Accounting access controls tested | No | Six existing offline QA safety tests pass; live entity/document/report/RLS and tenant-denial cases remain blocked. |
| Phase 2 can safely proceed | No | Discovery, source review and preparation can proceed; authenticated testing and enrollment/reconciliation/billing/access implementation must wait for all isolation evidence. |

## Actions and evidence obtained

1. Read current backend metadata only: production environment; production instance present; no development instance. No financial or customer records queried.
2. Read draft metadata: Investor reviewer QA, QA test access and Platform Architecture Overview all report `isolated_backend:false`. None qualifies as an isolated QA environment.
3. Search workspace projects: found **Harmonious QA**. A read-only snapshot is available; source checkout neither grants authority to inspect its database nor proves that it has no customers, secrets, storage or production integrations. No snapshot credentials were used.
4. Inspect supported command catalog and platform guidance: this chat has no supported project-creation/remix command. The public account connector does not support creating/remixing projects. Creating or choosing the QA project must happen in the Lovable editor; a read-only checkout cannot apply changes to that project.
5. Re-run `e2e/qa-safety.test.ts`: **6 passed, 0 failed**. These are fictional evidence/session-parser tests only.
6. Invoke existing browser suite with evidence/origin deliberately unset: **blocked as expected** by global setup before backend queries or navigation. No browser, authenticated account, fixtures or emails were exercised.

The preceding continuation reran 76 offline tests. This Phase 2 review reran six safety tests, not another 76, and does not turn prior offline results into deployed security verification.

### Candidate QA source findings

The Harmonious QA snapshot contains TanStack Start, bookkeeping/operational modules and independent environment-policy code: `src/lib/environment.server.ts`, `src/lib/integration-policy.server.ts` and `src/lib/qa-environment.test.ts`. The policy intends to disable integrations when unconfigured and gate QA email/jobs/sign-in integrations behind explicit flags. Browser and server clients read environment configuration separately; the privileged server client bypasses RLS, so each caller still needs authorization. These are source facts, not observed deployed settings or successful runtime tests.

Its migration histories contain literal data inserts, including offering/application/client-related rows; they must not be applied blindly. The bounded candidate migration scan found no direct HTTP cron creation calls, but this does not establish that deployed jobs, auth triggers or external schedulers are absent. Its release checklist and roadmap are historical documentation, not current isolation evidence. No candidate credentials, database records, providers or sessions were accessed, no files were copied into production, and its tests were not run here.

## Evidence required before authentication or data writes

| Isolation item | Required observation in the QA project's own context |
|---|---|
| Frontend binding | Inspect the served client configuration/request destination without submitting credentials; identify the exact QA target, including any proxy target. A local environment variable or preview hostname alone is insufficient. |
| Server binding | Verify deployed server connection target through trusted deployment metadata or a reviewed, non-secret server-binding diagnostic. Must match the frontend's independent QA backend. Never print keys or credentials. |
| Authentication | Verify separate project-local auth configuration and empty user inventory before fixtures; no production OAuth credentials or active sessions. Later synthetic sessions must have the verified QA issuer. |
| Storage | Verify separate project ownership, empty object inventory and private financial buckets; review policies before uploads. Do not copy production documents or source-project asset pointers as data. |
| No production credentials | Inspect QA configuration and connector metadata in its own context. Distinguish QA-managed internal credentials from external production credentials; record only pass/fail/presence, never values, fragments or hashes. Inspect copied source for embedded credentials without printing them. |
| Scheduled jobs | Inventory QA jobs, triggers, database webhooks and external schedules before applying historical migrations. Remove/disable unsafe jobs in QA only. No jobs may reference production destinations, services or secrets. |
| External integrations | Keep bank/payment/identity/email/CRM/Drive and all other provider call paths disconnected or replaced by reviewed local simulation adapters. Verify fail-closed behavior and runtime egress denial before invoking flows. No real provider probes. |
| Production resource denial | Independently review backend credentials, connector grants, storage sources, fixed production links and egress controls. Before synthetic account creation this is configuration/source evidence; after all checks pass, test denial using isolated local mocks or controlled QA targets, never a production account or credential. |

If any row is unavailable or uncertain, stop. Do not claim “isolated” on the strength of a project name, test/demo flag, token claim, different URL or unchecked checklist.

## Exact manual actions

### First option: review the already-existing Harmonious QA project

1. Open **Harmonious QA** from the Lovable dashboard. Do not sign into its application, connect providers or run imports.
2. In its own project chat, request the isolation-only review below. The agent there can inspect that project's own metadata/settings; this chat's cross-project checkout cannot.
3. Open **View Backend** in that project to review database/auth/storage and **Project Settings → Secrets** plus connector settings. Do not paste secret values into either chat. Review job/webhook inventories through that project's agent before enabling workflows.
4. Keep the project unpublished, restrict editor sharing to QA participants, and attach no Harmonious production domains. Separate project sharing does not substitute for application access control.
5. Require the complete evidence matrix above. If it contains old customer records, production credentials or unsafe external destinations, do not wipe it or repurpose it without a separate approved decision; create a fresh QA project instead.

### Fresh project when existing QA cannot qualify

1. Create a new blank project from the Lovable dashboard, named **Harmonious Bookkeeping Isolated QA**. Request an empty QA shell, not a copy of production data or historical migrations.
2. Enable a new, independent Lovable Cloud backend in the new project's chat. Do not connect the production backend, attach domains, link workspace provider credentials or restore production users/storage.
3. Before authentication/fixtures, independently inspect actual backend, auth, storage, runtime bindings, connector/secret metadata and job/webhook inventories. Keep bank connections, payment processing, notifications and all external API paths absent or fail-closed.
4. Ask the QA project's chat to read this production project's reviewed source via cross-project access. Transfer only reviewed source and schema/policy definitions needed for the test, excluding environment files, credentials, customer-bearing fixtures, generated/dependency files and production media. Do not replay full migration histories or copies of cron definitions. A source checkout is one-way, so make those changes from the QA project's chat, not here.
5. Review every schema change and historical literal before applying it in QA. Preserve database guards and existing accounting/authorization architecture; do not weaken rules to make fixtures pass.
6. Validate the evidence matrix before introducing the requested synthetic accounts/records. Record the actual separate backend and served origin privately in QA evidence, never secret values.

**Remix alternative:** Project name (top left) → Settings → **Remix this project**, or dashboard project menu → **Remix**. This is a documented manual action, not confirmation of inertness. Because copied schedules, source literals and integration targets may be unsafe before review, a remix is not the default here. Use it only after its creation-time side effects can be proven safe; otherwise use the fresh project sequence above.

No creation or remix was performed in this review. A new project may consume workspace/Cloud credits; no fixed cost or account-specific quota was verified.

### Copyable request for the QA project's chat

> Establish evidence for Bookkeeping Phase 2 isolation only. Do not authenticate, create accounts or financial fixtures, send notifications, call external providers or copy production records/secrets. Inspect this project's own backend identity, auth, storage, actual served frontend/server bindings, connector/secret metadata, job/trigger/webhook inventories and production URL references. Compare with Harmonious production through safe metadata/source inspection only. Verify separate database/auth/storage, absence of production records/credentials, inert schedules and blocked production API/bank/payment/email paths. Report Yes/No with evidence for every condition. Stop on anything unverified. Do not modify Harmonious production or weaken its safety harness. After every isolation condition is verified, prepare separately reviewed synthetic provisioning and security validation using the existing ledger and quote engines.

## Existing harness compatibility blocker

The current `e2e/qa-safety.ts` rejects **any** backend whose metadata environment is `production`, not only the known Harmonious production backend. A separate fresh Cloud QA project may still label its sole instance production. A new independent project therefore does not automatically satisfy the current preflight.

Do not change this production project's preflight or mislabel evidence. In the QA project's own source, review any required adaptation so the gate recognizes a positively identified dedicated QA instance while still requiring distinct backend identity, no production data/credentials, trusted runtime bindings, inert integrations and reviewed synthetic classification. Existing six-session categories must also be reconciled with the requested eight test roles without removing checks. Review and test those changes before navigation. Token parsing alone is not live authentication or authorization verification.

## Proposed accounting access design — not implemented or validated

Reuse canonical server-side authorization, atomic permissions, existing role/delegation assignments, ledger, bank reconciliation, financial statements and approval engines. Do not create an alternate ledger or grant entity financial access from free-text quote references.

| Resource/action | Proposed scope and separation to validate |
|---|---|
| Bookkeeping subscription/schedule details | Verified contracted exact legal entity; safe client projection only. No access from portfolio ownership or quote scope alone. |
| Books preparation | Explicit entity-scoped preparation capability; preparer records draft work and source evidence, cannot approve own work. Sales access remains commercial, not financial-document access. |
| Financial upload/read | Private entity-bound metadata/object path, authorized uploader, size/type validation, immutable replacement history; each upload/download rechecks active exact-entity access. Upload never proves review. |
| Reconciliation schedules | Exact entity/fiscal year, independent reconciliation and billing cadence; only authorized operational staff create/change future schedules, with history. |
| Review/approval | Explicit reviewer capability on that entity, documentation completeness, preparer/reviewer separation; preserve canonical reasoned Super Admin exception where applicable, never use it for self-granting authority. |
| Financial reports | Approved/released version only, explicit entity audience and existing report-release workflow; no internal notes, raw provider text, draft or another tenant's reports. |
| Portfolio reporting | Explicit current company-financial grant and report audience; holding ownership alone grants nothing. One company's grant never exposes siblings. |
| Revocation | Recheck authority at each request; revoke memberships/grants through existing audited paths, invalidate applicable reads and allow short-lived private links to expire; test stale-session/cache denial. |

This table is a candidate design, not new roles, deployed policies or proof of authority. Map it to existing permissions before adding additive schema; run the existing authorization review/shadow workflow rather than replacing legacy checks without a cutover.

## Synthetic validation after isolation passes

Prepare the requested startup, SPV, VC fund, holding company, three portfolio companies, fictional investors/accounts/transactions and separate administrator, Sales, bookkeeper, independent reviewer, fund manager, startup administrator, investor and unauthorized users. Create only in the validated QA project. Include a second tenant and different company grants to prove denial.

Test versioned pricing, tampered browser prices, wrong/missing version and snapshot, direct-write guards, immutable history, draft transitions, durable quote read-back and partial-write recovery. Verify exact-entity authorization, private uploads, supporting-document requirements, independent review, approved-report release, revocation and cross-tenant denial. Exercise billing, schedules, amendments and upgrades/downgrades through simulation only. No production providers, invoices, collections or financial records.

Only after the isolated environment and security tests pass may enrollment, fiscal reconciliation scheduling, review, simulation billing and client/portfolio views resume. Proposed pricing publication and production service activation require a separate release approval; offline tests are not sufficient.

## Outstanding blockers and unchanged production boundary

- Candidate QA runtime database/auth/storage and empty-data inventories unavailable to this chat.
- Actual frontend/server binding and production-credential absence unverified.
- Candidate external integration, notification, payment, bank, job and webhook inertness unverified.
- No supported unattended project creation/remix operation in this chat.
- Dedicated-QA compatibility with existing fail-closed harness requires reviewed QA-local work, not a production bypass.
- Exact-entity authorization, supporting-document review and cross-tenant/revocation checks untested.
- Prior accounting integrity/report-release defects remain release blockers.

**Tests:** six offline safety checks passed; zero offline failures; browser suite blocked before navigation. No deployed security or financial workflow claimed verified. No production application code, settings, secrets, auth, schema, signed agreements, pricing or financial records changed. Only review documentation, roadmap and the standing Phase 2 safety memory were updated.