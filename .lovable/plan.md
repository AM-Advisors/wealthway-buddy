# Bookkeeping & Accounting integration

## Outcome
Extend Harmonious’s existing quote-to-service experience with independently priced bookkeeping for funds, SPVs, companies, cap tables and explicitly authorized portfolio entities. Support standalone, add-on and contracted multi-entity engagements without a separate application.

## Safeguards
- Keep the supplied prices **internal and proposed** until explicit approval to publish. Do not change existing prices, signed agreements, financial records, issued invoices or production enrollments.
- Keep bookkeeping tiers separate from the existing servicing/inbox levels. Monthly bookkeeping billing does not change quarterly/annual-only SaaS platform billing.
- Use the existing quote approval, signing, billing, accounting and audit engines. No bank connection, invoice send, customer enrollment or money movement during testing.
- Preserve independent review and existing reasoned Super Admin exceptions. Portfolio ownership never grants company financial access.

## Implementation phases

### 1. Internal catalog and pricing configuration
- Add Bookkeeping & Accounting and its five configurable tiers to the existing service catalog and pricing administration experience.
- Store effective-dated proposed configuration, transaction/account allowances, descriptions, deliverables, deadlines, exclusions and optional charges. Ordinary Sales reps cannot change catalog rates.
- Show the reconciliation and billing choices separately. All automatic calculations use integer cents and are validated on the server.

Monthly-equivalent prices:

| Tier | Annual reconciliation | Quarterly reconciliation | Monthly reconciliation | Transactions/accounts included |
|---|---:|---:|---:|---|
| Self-Service | $79 | $89 | $99 | 250 / 3 |
| Essential | $150 | $200 | $250 | 50 / 2 |
| Growth | $300 | $400 | $500 | 150 / 4 |
| Professional | $650 | $825 | $1,000 | 350 / 8 |
| Enterprise | Custom | From $2,000 | From $2,500 | 500 / configured in custom quote |

Monthly invoices equal the monthly-equivalent amount; quarterly multiply by 3; annual multiply by 12. No automatic prepayment discount. Enterprise annual reconciliation cannot receive an automatic price.

Include the supplied cleanup, volume, account, entity, payroll-accounting, AR/AP, forecasting, reporting and analysis add-ons with their proposed prices. Unspecified Enterprise allowances, base entity counts and complex consolidation scope require explicit custom terms rather than invented limits.

### 2. Existing quote builder and SOWs
- Add guided tier, entitled entity/proposed entity reference, reconciliation, billing, expected volume, accounting method, reporting, add-on, effective-date and term inputs.
- Show live monthly-equivalent recurring fees, invoice amounts, annual contract value and separate one-time/usage charges. Support multiple bookkeeping lines without mixing legal entities’ scope.
- Save the exact configuration and approved pricing version in each quote-line snapshot; reuse the existing proposal preview, review/sign links and SOW generator.
- Block approval while overlapping contracted fund accounting/reporting is unresolved. Do not treat a product label alone as evidence of included services.
- Generate SOW scope, fees, covered entities, allowances, deliverables, responsibilities, exclusions and amendment provisions from the snapshot.
- Managed monthly deadlines: Essential 20, Growth 15, Professional 10, Enterprise 7 business days. Quarterly 20 and annual 30 business days, using the entity’s fiscal calendar and receipt of required documentation. Track missing records separately from processing delays. Self-Service has no managed completion guarantee.

### 3. Contract-gated enrollment and billing
- Represent draft, quoted, pending approval/contract/activation, active, suspended, cancelled and expired services through the existing service lifecycle where supported, adding only missing bookkeeping-specific records.
- Activate only after the required accepted/executed contract and authorized operational action; retain any existing payment prerequisites. Draft quotes never activate services.
- Link enrollment to the exact entity, client and SOW; snapshot tier, frequencies, dates and scope. Route managed work to existing staff assignment controls without granting access through assignment alone.
- Reuse signed-SOW invoice schedules. Preserve the distinction between commercial draft billing and active service delivery; no bookkeeping invoice can be sent before its required execution/activation controls are satisfied.
- Resolve first-period ownership between acceptance-created invoices and recurring schedules so the same period cannot be billed twice. Route standalone/company bookkeeping handoffs to the covered entity, not the generic handoff that currently creates a draft fund when no fund is linked.
- Record upgrade, downgrade and frequency requests, approved amendments and financial impact. New rates and schedules apply prospectively; retain all prior periods, completed work and invoices. Catch-up work is separately quoted.

### 4. Reconciliation and reviewed reporting
- Reuse canonical bank transactions, journals, reconciliations, accounting periods, exceptions, close controls and report-package review/release.
- Generate idempotent monthly, quarterly or fiscal-year work periods only for eligible enrollments, using the existing task/job framework. Show documents → review → reconciliation → exceptions → prepared → independent review → approval → release → completion.
- Distinguish imported/unposted transactions from official posted books. Do not release category-based summaries as reviewed financial statements.
- Address service-critical audit findings before enabling customer accounting writes: exact role/entity scope, source deduplication and transactional application/retry safety. Leave existing posted history unchanged; ambiguous historical items require explicit review rather than silent repair.
- Enforce preparer/reviewer separation and freeze approved report versions. Unknown statement balances cannot masquerade as completed reconciliation.
- Require every contracted report in a released package; a reconciliation linked to a draft journal cannot be displayed as posted books or a completed approved close.

### 5. Client and portfolio views
- Extend Accounting on existing fund/company dashboards with tier, scope, current period, last/next reconciliation, documentation, outstanding requests, assigned team and released reports.
- Self-Service can upload/import, classify and reconcile within explicit entity authorization; user-prepared reports remain clearly distinct from Harmonious-reviewed reports. Existing integration availability and consent gates remain in place.
- Managed clients upload documents, see progress and requests, access finalized reports and request changes; they cannot mark staff reviews approved.
- Portfolio summaries show only explicitly entitled companies and permitted financial metrics. Separate company subscriptions remain required unless an executed Enterprise agreement expressly covers them.

## Technical approach
- Preserve TanStack Start server-function boundaries, the existing lightweight auth middleware, server-side role/resource checks and semantic UI components.
- Reuse service_catalog, pricing version systems, sales quote lines/versions, client_sows, service_engagements and their events, client_entities, invoice_schedules and canonical accounting tables wherever compatible. Extend engagements for SOW/quote-line evidence, cadence and explicit entity coverage instead of creating a second subscription lifecycle.
- Add only missing effective-dated configuration, quote/enrollment entity relationships, reconciliation schedule and append-only evidence structures; use additive changes with explicit grants, RLS, constraints and transaction-safe transitions.
- Existing books already support client entities and cap-table companies; extend their currently fund-oriented authorization with an explicit legal-entity scope adapter, never fake funds or duplicate ledgers. Confirm deployed schema/controls and the exact extension before schema changes.
- Keep all automatic scheduling, billing and delivery integration disabled for proposed/unactivated bookkeeping. Existing jobs must not accidentally discover and send staged data.

## Verification and deliverables
- Add focused tests for every price, multiplier, allowance, custom-price gate, deadline, overlap, activation, amendment, tenant access and review rule, using fictional data.
- Cover all 17 supplied acceptance scenarios, including Cap Table/SPV add-ons and unchanged existing functionality. Run relevant existing regressions.
- Use existing isolated-QA preflight before authenticated quote → signature → activation → reconciliation → report read-back. The current backend serves live records; no isolated QA has been established, so those checks remain blocked until independently isolated synthetic accounts and frontend binding are verified.
- Deliver a module/reuse summary, schema changes, pricing/quote/SOW/portal/scheduling/billing status, permission checks, test results and manual configuration gaps. Clearly separate implemented, offline-verified, blocked and proposed functionality; do not claim production readiness without end-to-end evidence.

## Approval boundaries
Approval of this plan authorizes the staged integration, not public pricing publication, live invoices, bank connections, production customer enrollment or modification of existing agreements. Live release requires explicit approval and completed verification.