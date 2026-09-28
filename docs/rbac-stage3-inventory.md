# RBAC Stage 3 — legacy authorization migration inventory

Generated in Stage 2. Nothing here has been migrated; existing checks still enforce production.

Files with direct role/admin checks: 109
Totals after Stage 2.5 manual validation: safe to migrate mechanically: 2; requires resource-aware migration: 65; protected/specialized — keep dedicated: 42

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

- `src/lib/allocations.server.ts` — protected/specialized — keep dedicated (reclassified in 2.5: accounting allocations)
- `src/lib/nav.server.ts` — protected/specialized — keep dedicated (reclassified in 2.5: session/workspace resolver)
- `src/lib/navigation.ts` — safe to migrate mechanically (manually confirmed: global staff check, no scoped record)
- `src/lib/reconciliation.server.ts` — protected/specialized — keep dedicated (reclassified in 2.5: accounting reconciliation)
- `src/lib/valuation.server.ts` — protected/specialized — keep dedicated (reclassified in 2.5: valuation/NAV)

## Onboarding (15)

- `src/lib/client-onboarding.functions.ts` — requires resource-aware migration
- `src/lib/compliance-holds.functions.ts` — protected/specialized — keep dedicated
- `src/lib/compliance.functions.ts` — protected/specialized — keep dedicated
- `src/lib/didit.functions.ts` — protected/specialized — keep dedicated
- `src/lib/eligibility.functions.ts` — protected/specialized — keep dedicated (reclassified in 2.5: Bad Actor / eligibility)
- `src/lib/fund-compliance.functions.ts` — protected/specialized — keep dedicated
- `src/lib/identity.server.ts` — protected/specialized — keep dedicated (reclassified in 2.5: identity verification)
- `src/lib/investor-onboarding.server.ts` — requires resource-aware migration
- `src/lib/kyc-aml.functions.ts` — protected/specialized — keep dedicated
- `src/lib/manager-onboarding.functions.ts` — requires resource-aware migration
- `src/lib/onboarding-compliance.server.ts` — protected/specialized — keep dedicated
- `src/lib/onboarding-intake-model.ts` — requires resource-aware migration (reclassified in 2.5: touches client/fund/company/investor/profile records)
- `src/lib/onboarding-ops.server.ts` — requires resource-aware migration (reclassified in 2.5: touches client/fund/company/investor/profile records)
- `src/lib/onboarding-progress.functions.ts` — requires resource-aware migration (reclassified in 2.5: touches client/fund/company/investor/profile records)
- `src/routes/_authenticated/manager.onboarding.tsx` — requires resource-aware migration

## Companies (4)

- `src/lib/cap-table.functions.ts` — requires resource-aware migration
- `src/lib/captable-leads.functions.ts` — requires resource-aware migration
- `src/lib/contract-ingestion.ts` — requires resource-aware migration (reclassified in 2.5: touches client/fund/company/investor/profile records)
- `src/lib/staff-cap-table.functions.ts` — requires resource-aware migration

## Investors (4)

- `src/lib/investor-directory.functions.ts` — requires resource-aware migration
- `src/lib/manager-profile.functions.ts` — requires resource-aware migration
- `src/lib/subscription.functions.ts` — requires resource-aware migration (reclassified in 2.5: touches client/fund/company/investor/profile records)
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
- `src/lib/contracts.functions.ts` — requires resource-aware migration (reclassified in 2.5: touches client/fund/company/investor/profile records)
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

- `src/components/application-review.tsx` — requires resource-aware migration (reclassified in 2.5: touches client/fund/company/investor/profile records)
- `src/components/operations-board.tsx` — requires resource-aware migration (reclassified in 2.5: touches client/fund/company/investor/profile records)
- `src/components/portal-message-thread.tsx` — requires resource-aware migration (reclassified in 2.5: touches client/fund/company/investor/profile records)
- `src/components/staff-calendar.tsx` — requires resource-aware migration (reclassified in 2.5: touches client/fund/company/investor/profile records)
- `src/components/staff-desk.tsx` — safe to migrate mechanically (manually confirmed: global staff check, no scoped record)
- `src/components/team-access-board.tsx` — protected/specialized — keep dedicated (reclassified in 2.5: staff access administration → access-admin)
- `src/lib/admin-activity.functions.ts` — requires resource-aware migration (reclassified in 2.5: touches client/fund/company/investor/profile records)
- `src/lib/agreements-admin.functions.ts` — requires resource-aware migration (reclassified in 2.5: touches client/fund/company/investor/profile records)
- `src/lib/agreements.functions.ts` — requires resource-aware migration (reclassified in 2.5: touches client/fund/company/investor/profile records)
- `src/lib/application-approval.functions.ts` — protected/specialized — keep dedicated (reclassified in 2.5: approval maker/checker)
- `src/lib/application-timeline.functions.ts` — requires resource-aware migration (reclassified in 2.5: touches client/fund/company/investor/profile records)
- `src/lib/audit-log.functions.ts` — protected/specialized — keep dedicated (reclassified in 2.5: immutable audit access)
- `src/lib/closing.functions.ts` — protected/specialized — keep dedicated (reclassified in 2.5: closing)
- `src/lib/delegations.functions.ts` — protected/specialized — keep dedicated (reclassified in 2.5: professional authority / canAct)
- `src/lib/invitation-role.ts` — requires resource-aware migration (reclassified in 2.5: touches client/fund/company/investor/profile records)
- `src/lib/invitations.functions.ts` — requires resource-aware migration (reclassified in 2.5: touches client/fund/company/investor/profile records)
- `src/lib/offboarding.functions.ts` — protected/specialized — keep dedicated (reclassified in 2.5: offboarding)
- `src/lib/operations.functions.ts` — requires resource-aware migration (reclassified in 2.5: touches client/fund/company/investor/profile records)
- `src/lib/ops-capabilities.ts` — requires resource-aware migration
- `src/lib/performance.functions.ts` — requires resource-aware migration (reclassified in 2.5: touches client/fund/company/investor/profile records)
- `src/lib/performance.server.ts` — protected/specialized — keep dedicated (reclassified in 2.5: performance calculations)
- `src/lib/policies.functions.ts` — protected/specialized — keep dedicated (reclassified in 2.5: legal wording maker/checker)
- `src/lib/portal-access.functions.ts` — requires resource-aware migration (reclassified in 2.5: touches client/fund/company/investor/profile records)
- `src/lib/responsibilities.functions.ts` — requires resource-aware migration (reclassified in 2.5: touches client/fund/company/investor/profile records)
- `src/lib/reviewer-activity.functions.ts` — requires resource-aware migration (reclassified in 2.5: touches client/fund/company/investor/profile records)
- `src/lib/reviewer-authz.server.ts` — protected/specialized — keep dedicated (reclassified in 2.5: reviewer access)
- `src/lib/role-overview.functions.ts` — requires resource-aware migration (reclassified in 2.5: touches client/fund/company/investor/profile records)
- `src/lib/session-facts.server.ts` — protected/specialized — keep dedicated (reclassified in 2.5: session/workspace resolver)
- `src/lib/session.functions.ts` — protected/specialized — keep dedicated (reclassified in 2.5: session/workspace resolver)
- `src/lib/staff-access.functions.ts` — protected/specialized — keep dedicated (reclassified in 2.5: staff access administration → access-admin)
- `src/lib/staff-portal.functions.ts` — requires resource-aware migration (reclassified in 2.5: touches client/fund/company/investor/profile records)
- `src/lib/timeline.functions.ts` — requires resource-aware migration (reclassified in 2.5: touches client/fund/company/investor/profile records)
- `src/routes/_authenticated/admin.email-preview.tsx` — requires resource-aware migration (reclassified in 2.5: touches client/fund/company/investor/profile records)
- `src/routes/_authenticated/admin.index.tsx` — requires resource-aware migration (reclassified in 2.5: touches client/fund/company/investor/profile records)
- `src/routes/_authenticated/admin.new-application.tsx` — requires resource-aware migration (reclassified in 2.5: touches client/fund/company/investor/profile records)


## Stage 2.5 note
All 47 files originally labelled "safe" were re-inspected for scoped-record access (client, fund, company, investor, profile, onboarding, investment). Only 2 remain safe. Every endpoint must pass shadow authorization (legacy vs canonical) before cutover; never migrate on filename alone.
