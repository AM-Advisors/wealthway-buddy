# Phase 0 — Experience Consolidation Audit

Read-only audit. Nothing was changed. Findings below, then the proposed Phase 1.

## 1. What already exists

**Role homes (seven, overlapping):** `home.tsx` (cross-role, `getRoleOverview`), `dashboard.tsx` (investor, 981 lines), `client.index.tsx` (company/client portal), `manager.index.tsx` (fund portfolio), `ops.index.tsx` (`OperationsWorkHome`), `admin.index.tsx` (application review queue), `professional.index.tsx` (my clients). The investor alone has three possible homes.

**Authoritative workflow records already exist for every Phase 1 item.** Onboarding/KYC/AML/accreditation: `investor_applications` (kyc/aml/accreditation/documents/funding status), `kyc_verifications`, `identity_check_results`, `accreditation_records`, `compliance_holds`. Signatures: `document_signatures` + `document_signature_signers` (Box Sign authoritative). Capital: `capital_calls`, `expected_fundings`, `capital_call_lines`. Money in: `bank_reconciliations`, `bank_transactions`, `payments`, `wire_confirmations`. Money out: `distribution_batches/lines/payments/exceptions`, `investor_payment_instructions`. Accounting: `accounting_periods`, `journal_entries`, `accounting_exceptions`. Valuation/NAV: `portfolio_valuations`, `nav_versions`. Reporting: `financial_reports`, `close_checklist_items`. Tax: `tax_years`, `tax_document_records`, K-1/1099/1042 tables. Commercial: `invoices`, `wire_requests`, `client_intake_requests`, `engagement_change_orders`, `engagement_services`, `client_sows`. Cap table: `ct_*` incl. `ct_concierge_cases/exceptions`. Delegation: `delegations`, `delegation_permissions`, `professional_memberships`.

**A derivation engine already exists.** `src/lib/ops-work-queue.server.ts` reads ~22 authoritative tables and normalises them into capability-gated `WorkItem`s (`ops-work-items.ts` supplies sections/priority); served by `getOpsWorkQueue`/`getOpsRecentActivity`, rendered by `ops-home.tsx`. It stores no second status. This is the pattern Phase 1 should reuse rather than reinvent.

**Not yet in that engine:** signatures, invoices/wires, service requests/SOW/change orders, cap-table concierge, tax, delegations.

**Activity is split three ways:** `contract_audit_events` (via `ActivityPanel`), `getClientPortalActivity` (staff-only client timeline), `ai_action_log`, plus ~28 per-domain `*_events` tables. No union, no client-safe timeline.

**Search:** no global search. Only `listOpsRecords` `ilike` name matching over clients/offerings/companies/profiles, authorization applied before results — a record picker, not ⌘K.

**Notifications:** `notification_events` (written on wire approval), `assisted_notifications`, `authority_notifications`. No unified surface.

## 2. UX fragmentation

1. **Three parallel sidebars** — `AppSidebar` (legacy, renders every role and ~90 links), `ClientSidebar` (`client-navigation.ts`, small curated lists), `OpsSidebar` (server-driven). Chosen by inline pathname tests in `_authenticated/route.tsx:76-103`, which duplicate `menuForContext()` in `client-navigation.ts:303-315` without calling it.
2. **Cap-table nav defined 3×**: `captable-nav.tsx` (live), `AppSidebar.capTableFounderItems`, `COMPANY_NAV`.
3. **Professional nav defined 3×**: `PROFESSIONAL_NAV` (5), `AppSidebar.professionalItems` (14), `professional.tsx` own `NAV` (14, the one rendered).
4. **Self-admitted legacy manager routes**: `MOVED_PAGES` redirects `/manager/nav|allocations|financials|performance-reporting|cash-approvals` into `?section=` tabs, yet all five route files still exist and `AppSidebar` still links them as top-level.
5. **Ops modelled as both in-app and external**: `workspaceOptions()` treats ops as another origin while `/ops/*` still lives in the same route tree with two sidebars able to render it.
6. **Duplicate route pair** `ops.fund.$fundId.tsx` vs `ops.funds.$fundId.tsx`.
7. **Probably dead investor links** in `AppSidebar.investorItems`: `/portal`, `/vault`, `/wire`, `/wire-confirmation`, `/prepared`, `/signatory`, `/statements` — no matching route files found.
8. **Flat admin clusters that should be tabbed**: cap-table admin (6 routes), money (6), onboarding (4).

## 3. Missing vs merely unsurfaced

**Merely unsurfaced (no new data):** investor/manager/company/professional "needs your attention", client-friendly status language, Fund Health, investment lifecycle presentation, service centre, activity timeline, document categorisation, notifications feed.

**Genuinely missing (new code, no new truth):** derivation collectors for signatures/invoices/SOW/cap-table/tax/delegations; a client-facing status vocabulary map; a client-safe activity projection; a permission-scoped global search; a notification read model; navigation consolidation to one source.

**Should NOT be built:** any new task/queue/status table, any RAG/green/amber health column, any second document store.

## 4. Controls the redesign must preserve

- Granular ops capabilities `area:action` (`ops-capabilities.ts`), re-checked per request via `requireOperations`/`gateRecord`; `canApprove` blocks self-approval.
- Server-side session resolution (`session.functions.ts` re-reads relationship facts each call); `operationsAccessFromEmail` hard-coded false.
- `requireSupabaseAuth` bearer validation; `reviewer-authz.server.ts` resolves records from the DB before authorising, never trusting client ids.
- Delegation gate `canAct()` re-resolving ownership, live delegation, org seat, authority ceiling, explicit permission; banking/wire/signing capabilities always denied.
- Masking: account last-4, TIN/EIN masking, KYC document-number masking, restricted-key redaction of audit blobs.
- Maker/checker in `distributions-model`, `nav-model`, `capital-calls-model`, `financial-reporting-model` — preparer ≠ approver, no service principals.
- Baseline: 47 test files, ~1,021 cases, typecheck clean, production build green.

## 5. Recommended order

1. Phase 1 Home + Action Center (derive-only, additive).
2. Phase 2 status language (pure mapping module, reused by Phase 1).
3. Phase 10 navigation consolidation (one nav source; keep all routes + redirects).
4. Phase 7 activity timeline, then Phase 9 notifications (same projection).
5. Phase 3 Fund Health, Phase 4 investment page.
6. Phase 8 documents, Phase 5 service centre, Phase 6 launch centre.
7. Global search last — it depends on the consolidated read models.

## 6. Proposed Phase 1

**New pure module `src/lib/attention-model.ts`** — types `AttentionItem` (id, workspace kind, group, title, plain-English status, record deep link, authoritative source table/id, due date if authoritative, severity) and `AttentionGroup` = needs_you | harmonious_working | waiting_third_party | recently_completed. Pure functions only; no I/O. Reuses `ops-work-items.ts` shapes where they already fit.

**New `src/lib/attention.server.ts`** — collectors mirroring the `safely()` capability-gated pattern of `ops-work-queue.server.ts`, but scoped to the caller's own relationships:
- investor: `investor_applications`, `kyc_verifications` (incl. expiring ID), `accreditation_records`, `document_signature_signers`, `capital_call_lines`, `expected_fundings`, `investor_payment_instructions`, `investor_statements`, `fund_tax_documents`.
- fund manager: `investor_onboardings`/exceptions, `capital_calls`, `expected_fundings`, `bank_reconciliations`, `accounting_periods`, `nav_versions`, `financial_reports`, `distribution_batches`, `tax_years`.
- company/founder: `ct_concierge_cases/exceptions`, `ct_events`, `document_signatures`, `client_intake_requests`.
- professional: per-delegation aggregation strictly through `canAct()`, never a cross-delegation join.

**New `src/lib/attention.functions.ts`** — `getAttention` (GET, `requireSupabaseAuth`), workspace kind re-resolved server-side from `session.functions.ts`, never accepted from the browser.

**New `src/components/attention-center.tsx`** — four grouped sections, generous spacing, plain status text, explicit empty/loading/error states, every row deep-linking to the authoritative record.

**Routes touched (render only):** `home.tsx` (primary Home), `client.index.tsx`, `manager.index.tsx`, `professional.index.tsx` gain the component above their existing content. `dashboard.tsx`, `ops.index.tsx` and all other routes unchanged; no route deleted, no redirect changed.

**Explicitly not in Phase 1:** no schema change, no new table, no navigation change, no status writes, no approval actions rendered in the centre (deep link only).

## 7. Tests

Baseline: 47 test files, ~1,021 cases. Phase 1 adds roughly 30:

- `attention-model.test.ts` (~14): grouping rules, no invented status, "not available" when a source is absent, due date only when authoritative, plain-language mapping is presentation-only.
- `attention-authz.test.ts` (~16, adversarial): signed-out rejected; cross-client, cross-fund, cross-investor and cross-profile id substitution; unauthorized company access; expired/revoked delegation yields nothing; deactivated staff; view-only vs action; banking masked; identity documents absent from items; no internal review notes leak; hidden UI never treated as authorization; professional aggregation never mixes delegations.

Run: full suite, typecheck, production build.

---

Approve to proceed with Phase 1 only.
