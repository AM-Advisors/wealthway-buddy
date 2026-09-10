# Enforce each client's agreement conditions on fund onboarding and wires

Today the conditions from a client's statement of work (allowed exemptions, accredited-investor
limits, owner counts, fee thresholds) are only *displayed* on the fund's agreement card. Nothing
stops an application or a wire when a condition is broken. This change makes those conditions the
gate.

## How it will behave

**One shared conditions check.** A single evaluation runs on the server for a fund: it pulls the
fund's client, the active statement of work, the platform rule defaults plus that engagement's
overrides, and the fund's live investor data. Every screen and every action uses the same result,
so nothing can disagree.

**Hard stop when a condition is broken.** If the fund relies on an exemption the agreement does not
allow, has investors without confirmed accredited status where the agreement requires it, or is over
its allowed owner count, then:

- new applications to that fund are refused,
- the funding step, wire selection, funding acknowledgement, and wire confirmation are refused,
- the fund page shows exactly which condition is blocking and who can clear it.

Only legal, finance, client success, CEO/CRO or admin authority can clear a blocked condition, with a
recorded reason. Clearing is per fund, per condition, and is written to the contract audit trail.

**No agreement recorded means blocked.** A fund with no active statement of work cannot take new
applications or move money. The message says the engagement scope has not been recorded yet and
points the client to their Harmonious contact. Existing funds already in flight will therefore need a
statement of work recorded before their next application or wire — the plan includes a staff view
listing every fund currently in that state so it can be handled deliberately.

**Fee thresholds: notice plus approval.** When a fund passes its per-investor fee threshold, the fund
page, subscription page and funding dashboard show that the additional per-investor fee now applies,
with the count and the rate. Onboarding of further investors past the threshold pauses until someone
with contract authority acknowledges the fee. The acknowledgement records the investor count and rate
at that moment, so a later increase past a new threshold asks again.

**Wording stays MSA-aligned.** Blocked screens describe scope and client responsibility; they never
suggest Harmonious is making a legal, tax or investment determination.

## Technical outline

- New `src/lib/fund-conditions.functions.ts` with an internal `evaluateFundConditions(supabase,
  offeringId)` returning `{ configured, findings, blocking[], feeNotice }`, reusing the existing
  rule-resolution logic in `eligibility.functions.ts` (extracted so both share one source).
- New guard `assertFundConditions(supabase, offeringId, { stage: "application" | "funding" })`
  throwing plain-language errors.
- Call sites:
  - `apply.functions.ts` → `applyToFund`, after the fund is loaded and before the insert.
  - `funding.functions.ts` → inside `assertFundable` path for `getFunding`, `acknowledgeFunding`,
    `chooseWire`, `markWireSent`, `submitWireConfirmation`, `startAchDebit`.
  - `payment-controls.functions.ts` → alongside the existing `assertNoHold` calls on instruction
    creation and approval.
- New table `public.fund_condition_clearances` (offering_id, rule_key, kind `cleared` | `fee_ack`,
  reason, snapshot jsonb, created_by, created_at) with GRANTs, RLS: staff with contract authority
  insert; assigned managers, client users and staff read. Each clearance also writes a
  `contract_audit_events` row.
- UI:
  - `fund-agreement-card.tsx` Conditions tab gains blocking badges, the clear/acknowledge action for
    authorised staff, and the current clearance record.
  - `service-gate.tsx`-style blocked banner reused on `/apply`, `/subscription`,
    `/onboarding/funding`, `/wire-confirmation`.
  - Fee notice line on `/subscription`, `/onboarding/funding` and `/admin/funding`.
  - New staff panel on `/admin/contracts` listing funds with no active statement of work and funds
    with an open blocking condition.

## Out of scope

No change to how rules or overrides are authored (that stays in the SOW editor), and no change to
pricing calculations beyond showing the threshold notice.
