# Phase D — Distributions, return of capital, withholding and outbound money

Build the full outbound distribution lifecycle on top of the systems already in place. Nothing here replaces the existing accounting, reconciliation, allocation, compliance-hold or capital-account machinery — distributions become another governed source that feeds them.

## Lifecycle

```text
economic entitlement -> proposed batch -> Harmonious review -> manager approval
-> investor confirmation (where configured) -> destination verified
-> Harmonious final approval (second human) -> execution -> provider/bank confirmation
-> reconciliation -> GL posting -> capital account -> investor notice
```

A payment is only "paid" when the bank record is reconciled and the journal is posted. No screen action alone moves a distribution forward.

## What gets built

### 1. Records (one new migration, additive)
- **Distribution batches** — fund, batch number, version, type, total gross, withholding, fees, reserves, net, currency, recipient count, approval state, payment state, source proceeds and the allocation run it came from. Published batches immutable; corrections supersede.
- **Distribution lines** — one per investor position/profile: gross, withholding detail, fees, net, characterization, destination version, approval/payment/reconciliation/accounting state.
- **Withholding lines** — type (federal, foreign person, backup, state, other), basis, rate, amount, jurisdiction, and the investor tax profile/document relied on. Never inferred from citizenship alone.
- **Investor payment instructions** (separate from profile data) — method (bank/ACH/wire/custodian/other), masked display values, full values protected server-side, version history, verification and release state, approver, superseded pointer, cooling-off window.
- **Payment instruction change requests** — request, step-up, verification, review, approval, notifications sent, old/new masked destination.
- **Payment executions** — provider, provider payment ID, submitted amount and destination, instruction version, timestamps, human approval chain, idempotency key.
- **Provider events** — verified, correlated, replay-proof (unique provider event id).
- **Distribution exceptions** and an **append-only distribution event log**.
- **Distribution notices** — versioned, immutable once published, registered in the existing report/document registry.

All tables get grants, RLS (staff full; manager only own funds and no bank detail; investor only their own line) and triggers making approved/published/executed rows immutable.

### 2. Rules engine (`distributions-model.ts`, pure)
Entitlement from position/class/capital account/waterfall output; batch balance check (gross − withholding − fees = net, one cent blocks approval); withholding computation; state machines for batch, line, payment and instruction; maker/checker rule (no single human as creator + final approver + executor, service roles never count as approvers); destination validity and supersession; provider event correlation; return/reversal handling; exception taxonomy; manager and investor redaction.

### 3. Server engine (`distributions.server.ts` + `.functions.ts`)
Authority resolved from authoritative records on every call. Covers: propose batch from an approved allocation run, manual adjustment with reason/evidence/approval, manager request/approve, investor confirmation, destination verification, cooling-off enforcement, compliance-hold gate via the existing `assertNoHold`, cash sufficiency check, final Harmonious approval, execution, provider confirmation intake, failure/return/reissue, reconciliation handoff through the existing bank reconciliation + journal workflow, capital-account update only after posting, notice generation, and the full audit trail reconstruction.

### 4. Screens
- **Harmonious — Distributions & payments**: buckets for proposed, awaiting review, awaiting manager, instruction exceptions, cooling-off, ready for final approval, ready to execute, sent, failed/returned, reconciliation pending, accounting pending, completed. Bulk actions keep per-item authorization and audit.
- **Fund manager — Fund distributions**: batch, investor totals, gross/net, withholding summary, approval status, payment progress. No investor bank details.
- **Investor — Distributions**: fund, profile, date, gross, withholding, net, destination ending in four digits, status, notice, history. Strictly scoped to the exact profile, never merged across a person's profiles.
- Payment-instruction management with step-up, masked values and change history.

### 5. Tests
Adversarial suite covering all sixteen required proofs (cross-investor isolation, cross-fund manager, frozen approved amounts, bank change invalidating approval, maker/checker, signatory ≠ transaction authority, compliance hold, unverified destination, provider amount/destination mismatch, webhook replay, failed payments preserved, capital account waits for posting, withholding + net = gross, cross-profile substitution, superseded instructions). Plus reconciliation and accounting-integration tests. Then the full suite, typecheck and production build.

## Boundaries
- No parallel payment system; reconciliation and GL stay the existing engines.
- Delegated transaction authority stays off — professionals cannot change payment instructions or approve payments in this phase.
- No final tax determinations here; characterization is preserved for the tax engine.
- Work stops after Phase D.
