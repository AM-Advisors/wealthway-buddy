# Phase 3.10 — Commercial Model & Harmonious Staff (smoke-test-safe)

Goal: Client-level MSA, automatic Fund pricing snapshot, Sales pricing controls and a Harmonious staff model — without adding any new stop to Client → Fund → Investor work.

## 1. Gates found in the current code (to remove or neutralise)

| Where | What it does today | Change |
|---|---|---|
| Investor application check | Stops a new application when a statement-of-work condition is "blocking", when no scope is recorded, or when the per-investor fee isn't acknowledged | Commercial findings become Harmonious follow-up notices only. Real eligibility limits the client set (e.g. investor cap, exemption) stay as they are today unless they come only from a missing/unsigned SOW |
| Funding check | Already skips SOW checks | No change |
| Staff "Set up a fund" screen | Shows "Choose a signed agreement to continue" | Removed — the fund's pricing snapshot is created automatically |
| Fund page agreement card | Informational already | Relabelled "MSA Follow-Up Required" for staff; clients see "Services & Pricing — Approved" |
| Fund setup SOW list | Marks SOWs "Not signed / Waiting for approval" | Kept as history only, no longer a prerequisite |
| Client onboarding checklist | "MSA signed" item | Stays as a commercial follow-up, never a blocker |

Banking, signing, readiness, Person/Signature/Funding status and Next Action are not touched.

## 2. Client MSA
- MSA lives on the Client (existing records reused). One MSA covers all its Funds.
- Missing/unsigned MSA shows **MSA Follow-Up Required** to authorised staff only. Never an investor or Fund readiness item.

## 3. Automatic Fund Services & Pricing Snapshot
- When a Fund is created or requested, the app records a snapshot: Client, Fund, services, baseline price, final price, pricing version, who/when, source, any approved exception.
- Status is **Approved** straight away at or above baseline. No signature, checkbox or acceptance page.
- Later rate-card changes never change a saved snapshot.
- Existing Funds are not repriced or regenerated; where their pricing can't be worked out they show **Legacy Pricing Review** to staff only.

## 4. Pricing resolution and Sales controls
Order: current rate card → approved Client Pricing (if valid for the date) → authorised Fund-specific adjustment → snapshot.
- Sales may set a price at or above the baseline (checked on the server).
- Below baseline: the Fund is still created but its snapshot sits in **Pricing Approval Required** (Fund shows "Draft — Pricing Review" to staff). Nothing else about the Fund is blocked, and no other Fund is affected.
- Only Sales Management or a Super User can approve, and never their own request. The approver chooses **This Fund Only** or **Client Pricing — Future Funds**.
- Client Pricing records: service, price, effective date, optional expiry, approver, reason, scope.

## 5. Sales area
New **Harmonious → Sales** section with tabs: Clients, Fund Requests, Pricing, Pricing Approvals, Commercial Agreements, Pricing History. Reads the existing Client and Fund records — no copies.

## 6. Harmonious staff model (compatibility layer, no migration)
- Add two staff roles: **Sales** and **Sales Management**.
- A single mapping translates today's roles (admin, operations, finance, compliance, etc.) into "Harmonious staff + capabilities". Every existing check keeps working; nobody loses or gains access.
- Super User keeps elevated authority (discounts, Client Pricing, rate card, permissions). Ordinary Operations work never needs Super User.
- Sales gets commercial access only — no investor records, tax, full TIN/SSN, ID documents, KYC/AML, bank details or compliance evidence.

## 7. Verification
- Automated tests for: pricing resolution order, increase allowed, decrease routed, no self-approval, Fund-only vs Client scope, snapshot immutability, commercial states never appearing in readiness, application check no longer blocked by missing SOW, Sales denied restricted data, existing staff access unchanged.
- Fresh full test run, typecheck and production build after the last change.
- Read-only check in this project only. The mutating smoke tests (synthetic client, fund, investor, discount approval) must be run in the separate QA project.

Not in scope: duplicate-fund consolidation, the large database-link batch, legacy banking migration, deleting any historical agreements.

## Technical details
- Migration: `ALTER TYPE app_role ADD VALUE 'sales'`, `'sales_management'`; new tables `fund_pricing_snapshots` (append-only, one current per offering, status `approved|pricing_review|legacy_review`), `fund_pricing_snapshot_lines`, `pricing_approval_requests` (requester ≠ approver enforced in server + trigger), and effective/expiry/scope/reason columns on existing `client_pricing`. GRANTs + RLS: staff read, writes only via server functions.
- `src/lib/commercial-pricing.ts` (pure resolver + guards) and `commercial-pricing.server.ts`; snapshot written from the existing fund-create/request paths (failure logs a staff follow-up, never fails fund creation).
- `src/lib/harmonious-staff.ts`: legacy role → staff team + capability map; existing `STAFF_ROLES` lists extended with `sales`/`sales_management` only where commercial.
- `assertFundConditions("application")`: drop the "no recorded scope" and SOW-only findings; keep client-defined eligibility rules.
- Routes: `/_authenticated/sales/*`; fund pages get a `ServicesPricingCard` (client view hides baseline, approvals, notes).
- AGENTS.md rule added for the commercial snapshot and staff compatibility map.
