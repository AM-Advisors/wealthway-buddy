# RBAC Stage 3 — legacy authorization migration inventory

Generated in Stage 2. Nothing here has been migrated; existing checks still enforce production.

Files with direct role/admin checks: 109
Totals: protected/specialized — keep dedicated: 24; requires resource-aware migration: 38; safe to migrate mechanically: 47

## Tax (5)

- `src/lib/accounting.server.ts` — protected/specialized — keep dedicated
- `src/lib/financial-reporting.server.ts` — protected/specialized — keep dedicated
- `src/lib/fund-tax.functions.ts` — protected/specialized — keep dedicated
- `src/lib/investor-reporting.server.ts` — protected/specialized — keep dedicated
- `src/lib/tax-authz.server.ts` — protected/specialized — keep dedicated

## Capital/Banking (9)

- `src/components/wire-requests.tsx` — protected/specialized — keep dedicated
- `src/lib/bank-accounts.functions.ts` — protected/specialized — keep dedicated
- `src/lib/bank-feed.functions.ts` — protected/specialized — keep dedicated
- `src/lib/client-bank-accounts.functions.ts` — protected/specialized — keep dedicated
- `src/lib/fund-bank-reconciliation.functions.ts` — protected/specialized — keep dedicated
- `src/lib/payment-controls.functions.ts` — protected/specialized — keep dedicated
- `src/lib/wire-instructions.functions.ts` — protected/specialized — keep dedicated
- `src/lib/wire-requests.functions.ts` — protected/specialized — keep dedicated
- `src/routes/_authenticated/admin.funding.tsx` — requires resource-aware migration

## Accounting (5)

- `src/lib/allocations.server.ts` — safe to migrate mechanically
- `src/lib/nav.server.ts` — safe to migrate mechanically
- `src/lib/navigation.ts` — safe to migrate mechanically
- `src/lib/reconciliation.server.ts` — safe to migrate mechanically
- `src/lib/valuation.server.ts` — safe to migrate mechanically

## Onboarding (15)

- `src/lib/client-onboarding.functions.ts` — requires resource-aware migration
- `src/lib/compliance-holds.functions.ts` — protected/specialized — keep dedicated
- `src/lib/compliance.functions.ts` — protected/specialized — keep dedicated
- `src/lib/didit.functions.ts` — protected/specialized — keep dedicated
- `src/lib/eligibility.functions.ts` — safe to migrate mechanically
- `src/lib/fund-compliance.functions.ts` — protected/specialized — keep dedicated
- `src/lib/identity.server.ts` — safe to migrate mechanically
- `src/lib/investor-onboarding.server.ts` — requires resource-aware migration
- `src/lib/kyc-aml.functions.ts` — protected/specialized — keep dedicated
- `src/lib/manager-onboarding.functions.ts` — requires resource-aware migration
- `src/lib/onboarding-compliance.server.ts` — protected/specialized — keep dedicated
- `src/lib/onboarding-intake-model.ts` — safe to migrate mechanically
- `src/lib/onboarding-ops.server.ts` — safe to migrate mechanically
- `src/lib/onboarding-progress.functions.ts` — safe to migrate mechanically
- `src/routes/_authenticated/manager.onboarding.tsx` — requires resource-aware migration

## Companies (4)

- `src/lib/cap-table.functions.ts` — requires resource-aware migration
- `src/lib/captable-leads.functions.ts` — requires resource-aware migration
- `src/lib/contract-ingestion.ts` — safe to migrate mechanically
- `src/lib/staff-cap-table.functions.ts` — requires resource-aware migration

## Investors (4)

- `src/lib/investor-directory.functions.ts` — requires resource-aware migration
- `src/lib/manager-profile.functions.ts` — requires resource-aware migration
- `src/lib/subscription.functions.ts` — safe to migrate mechanically
- `src/routes/_authenticated/manager.profile.tsx` — requires resource-aware migration

## Documents (10)

- `src/components/signature-block-editor.tsx` — protected/specialized — keep dedicated
- `src/lib/box-sign.functions.ts` — protected/specialized — keep dedicated
- `src/lib/diligence-assistant.functions.ts` — requires resource-aware migration
- `src/lib/diligence.functions.ts` — requires resource-aware migration
- `src/lib/document-log.functions.ts` — requires resource-aware migration
- `src/lib/document-templates.functions.ts` — requires resource-aware migration
- `src/lib/document-versions.functions.ts` — requires resource-aware migration
- `src/lib/drive-intake.ts` — protected/specialized — keep dedicated
- `src/lib/signatory-authority.server.ts` — protected/specialized — keep dedicated
- `src/lib/signature-blocks.functions.ts` — protected/specialized — keep dedicated

## Clients (6)

- `src/lib/client-activity.functions.ts` — requires resource-aware migration
- `src/lib/client-admin.functions.ts` — requires resource-aware migration
- `src/lib/client-intake.functions.ts` — requires resource-aware migration
- `src/lib/contracts.functions.ts` — safe to migrate mechanically
- `src/lib/fund-sow.functions.ts` — requires resource-aware migration
- `src/routes/_authenticated/client.tsx` — requires resource-aware migration

## Funds (16)

- `src/components/fund-invitations.tsx` — requires resource-aware migration
- `src/lib/fund-conditions.functions.ts` — requires resource-aware migration
- `src/lib/fund-entity.functions.ts` — requires resource-aware migration
- `src/lib/fund-migration.functions.ts` — requires resource-aware migration
- `src/lib/fund-page.functions.ts` — requires resource-aware migration
- `src/lib/fund-setup.server.ts` — requires resource-aware migration
- `src/lib/manager-fund.functions.ts` — requires resource-aware migration
- `src/lib/manager.functions.ts` — requires resource-aware migration
- `src/lib/offering-files.functions.ts` — requires resource-aware migration
- `src/lib/offering-memo.functions.ts` — requires resource-aware migration
- `src/lib/offering-packet.functions.ts` — requires resource-aware migration
- `src/lib/offering-statement.functions.ts` — requires resource-aware migration
- `src/lib/offerings.functions.ts` — requires resource-aware migration
- `src/lib/public-fund.functions.ts` — requires resource-aware migration
- `src/routes/_authenticated/admin.fund.$fundId.tsx` — requires resource-aware migration
- `src/routes/_authenticated/admin.funds.tsx` — requires resource-aware migration

## Administration (35)

- `src/components/application-review.tsx` — safe to migrate mechanically
- `src/components/operations-board.tsx` — safe to migrate mechanically
- `src/components/portal-message-thread.tsx` — safe to migrate mechanically
- `src/components/staff-calendar.tsx` — safe to migrate mechanically
- `src/components/staff-desk.tsx` — safe to migrate mechanically
- `src/components/team-access-board.tsx` — safe to migrate mechanically
- `src/lib/admin-activity.functions.ts` — safe to migrate mechanically
- `src/lib/agreements-admin.functions.ts` — safe to migrate mechanically
- `src/lib/agreements.functions.ts` — safe to migrate mechanically
- `src/lib/application-approval.functions.ts` — safe to migrate mechanically
- `src/lib/application-timeline.functions.ts` — safe to migrate mechanically
- `src/lib/audit-log.functions.ts` — safe to migrate mechanically
- `src/lib/closing.functions.ts` — safe to migrate mechanically
- `src/lib/delegations.functions.ts` — safe to migrate mechanically
- `src/lib/invitation-role.ts` — safe to migrate mechanically
- `src/lib/invitations.functions.ts` — safe to migrate mechanically
- `src/lib/offboarding.functions.ts` — safe to migrate mechanically
- `src/lib/operations.functions.ts` — safe to migrate mechanically
- `src/lib/ops-capabilities.ts` — requires resource-aware migration
- `src/lib/performance.functions.ts` — safe to migrate mechanically
- `src/lib/performance.server.ts` — safe to migrate mechanically
- `src/lib/policies.functions.ts` — safe to migrate mechanically
- `src/lib/portal-access.functions.ts` — safe to migrate mechanically
- `src/lib/responsibilities.functions.ts` — safe to migrate mechanically
- `src/lib/reviewer-activity.functions.ts` — safe to migrate mechanically
- `src/lib/reviewer-authz.server.ts` — safe to migrate mechanically
- `src/lib/role-overview.functions.ts` — safe to migrate mechanically
- `src/lib/session-facts.server.ts` — safe to migrate mechanically
- `src/lib/session.functions.ts` — safe to migrate mechanically
- `src/lib/staff-access.functions.ts` — safe to migrate mechanically
- `src/lib/staff-portal.functions.ts` — safe to migrate mechanically
- `src/lib/timeline.functions.ts` — safe to migrate mechanically
- `src/routes/_authenticated/admin.email-preview.tsx` — safe to migrate mechanically
- `src/routes/_authenticated/admin.index.tsx` — safe to migrate mechanically
- `src/routes/_authenticated/admin.new-application.tsx` — safe to migrate mechanically
