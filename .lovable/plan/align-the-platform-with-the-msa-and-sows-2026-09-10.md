# Align the platform with the MSA and SOWs

Today the platform is organised around funds and four roles (admin, operations, fund manager, investor). Everything a fund can do is available to every fund. This work introduces the contract as real business logic: a Client signs an MSA, each engagement has a Statement of Work, and the SOW decides which services appear, which workflows run, and what they cost.

I'll build it in four stages so nothing that works today breaks. The exact wording and terms will be taken from the MSA and SPV SOW documents once you attach them; anything I can't confirm from the documents I'll flag rather than invent.

## Stage 1 — Clients, SOWs and service entitlements

- New **Client** layer above funds. A client holds the MSA (signed date, version, document), authorised contacts, and one or more SOWs. Every fund/SPV belongs to a client. Existing funds are attached to a client created from their current manager assignment, so nothing is orphaned.
- Each **SOW** lists services with: category, status (included / optional / requested / not included), effective and end dates, pricing model, client responsibilities, Harmonious responsibilities, required approvals, required documents, required compliance checks, and third-party dependency.
- A **service catalog** covering the categories you listed: formation, investor onboarding and compliance, fund administration, banking and payments, regulatory filings, tax coordination, financial reporting.
- A single reusable gate used everywhere: when a service isn't in the active SOW the page shows "This service is not currently included in your active scope" with a **Request service** button, instead of hiding or silently offering it. Capital calls, additional closes, additional assets, expense reserves, follow-ons and audit support are gated this way from day one.
- **Fund/SPV eligibility rules** (US formation, 506(b)/506(c), accredited investors, single class, Harmonious-approved bank account, PFIC/CFC restrictions) stored as editable configuration per SOW, not fixed in the product.

## Stage 2 — Compliance holds and money controls

- A universal **compliance hold** that can pause investor onboarding, banking, wires, distributions, filings, entity actions, document execution or a whole service. Each hold records the reason (from your list), who placed it, internal notes, a separate client-visible explanation, what's needed to clear it, and when it was cleared. Held items are blocked at the point of action, not just labelled.
- Every money movement gains: originating account, beneficiary, amount, purpose, supporting document, requested by, authorised by, approval time, dual-approval state, verification and callback status, bank status, compliance status. Staff can pause or reject an instruction as incomplete, inconsistent, suspicious, sanctioned or unauthorised, with the reason recorded.
- No path exists for fees to be taken from fund or investor money without a recorded authorisation.
- **Audit log** extended across wires, distributions, KYC/KYB, accreditation, filings, contract changes, investor data, bank changes, marketing releases, AI-assisted actions and holds — capturing user, organisation, role, before/after values, approval, source and session details.

## Stage 3 — Pricing catalog and change-of-scope

- Versioned, admin-editable **pricing catalog** seeded with the current SPV pricing (tiered SPV fees, Delaware management and master LLC, tax services, capital call, additional close, additional asset, financial statements, side letter, extra distribution, per-investor fee above 20, membership transfer, Blue Sky state fees, dissolution). Publishing a new version never changes prices already contracted.
- Per client: contracted price, standard price, discount, effective date, pricing version, approval history, and the SOW it came from.
- **Request additional service** workflow: client requests, Harmonious reviews, fee proposed, amendment/order form generated, client approves and signs, entitlement activates, tasks are created, effective date and approver logged. Staff cannot switch a material service on without that record.

## Stage 4 — Language, responsibility and the new dashboard

- **Responsibility matrix** component on every service page: Harmonious handles / Client handles / Third party handles, drawn from the SOW record rather than written into each page.
- **Third-party providers** as records (Azure, Google, banks, payment rails, KYC vendors, tax providers, registered agents, government systems) with type, service dependency, data categories, contract status, security documentation, SLA and current status. Actions that depend on a third party are visually marked, and no copy promises third-party timing, approval or availability.
- **Copy audit** across the public site and every in-app page, replacing anything implying Harmonious manages investments, guarantees compliance or filings, approves investments, custodies assets or gives legal or tax advice — with administration, support, coordination, facilitation and recordkeeping language. Financial statements are never called audited or reviewed.
- **Client/fund dashboard** restructured into Overview, Services, Onboarding, Banking, Administration, Compliance, Tax, Documents, Billing, Audit Log, Settings & Authorised Users.
- **Roles**: add Harmonious Legal, Compliance, Fund Administration, Tax, Finance, Client Success, Executive and Super Admin, plus client-side GP/Manager, Authorised Signatory, Finance, Legal, Compliance and Read-only, and investor-side Entity Representative and Beneficial Owner. Approval authority is per role — a role without explicit authority cannot approve a transaction, filing, contract change or data release.
- **Data governance**: classifications for client confidential, investor confidential, KYC/KYB, tax, banking, transaction, regulatory and de-identified analytics; a **Marketing Release** record (name, logo, testimonial, case study, dates, document) that must exist before identifiable client or investor details can be used in marketing.
- **Retention and offboarding**: records marked active, returned, eligible for deletion, retained under obligation, legal hold or deleted; termination follows notice, SOW identification, 60-day period, final services, invoices, transitions, export, retained-record decision, access removal and final audit entry — terminating one SOW leaves the others running.
- **AI rules**: AI-assisted actions logged, confidential data never used to train general-purpose models, and human review required before anything touching money, filings, legal documents, holds or investor eligibility.

## Technical notes

- New tables: `clients`, `client_sows`, `service_catalog`, `service_entitlements`, `pricing_versions`, `pricing_items`, `client_pricing`, `service_requests`, `third_party_providers`, `compliance_holds`, `data_classifications`, `marketing_releases`, `record_retention`, `offboarding_cases`, `ai_action_log`; `offerings` gains `client_id`; `app_role` enum extends with the new internal and client roles.
- Entitlement and hold checks live in shared server helpers (`entitlements.functions.ts`, `compliance-holds.functions.ts`) called from existing server functions — banking, wires, distributions, filings, tax, capital calls — rather than duplicated per page. Shared UI: `<ServiceGate>`, `<ResponsibilityMatrix>`, `<HoldBanner>`, `<ThirdPartyBadge>`.
- Existing tables (`offerings`, `fund_compliance_items`, `offering_bank_setup_requests`, `wire_requests`, `wire_confirmations`, `fund_tax_documents`, `payments`, `user_roles`) are reused and extended, not replaced. RLS on every new table with explicit grants; existing manager/operations flows keep working throughout.
- Each stage ends with a typecheck, a build, and an authenticated walkthrough of the pages it touched.

## Gap list

At the end of Stage 4 I'll give you: what already existed, what changed, new tables and fields, new workflows, contractual controls added, and anything left needing outside work (bank APIs, e-signature of order forms, invoicing/accounting integration, government filing systems).
