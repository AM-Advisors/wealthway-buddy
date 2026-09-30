# Phase 3: Operations Services in Fund Setup (record-only)

## Goal
Harmonious staff can track entity formation, EIN applications and Beneficial Ownership (BOI) reports for each Fund, inside Fund Setup. Harmonious completes these services for clients; the platform records the work and evidence. Nothing is filed, paid or submitted automatically.

## What users will see
- **Entity & EIN section** gets a "Formation service" card: state, entity type, registered agent, status (Not started, Preparing, Submitted by Harmonious, Approved, Rejected), dates, confirmation number, and the uploaded certificate.
- **EIN application** card: builds on the existing SS-4 generator; status tracking (Draft, Ready for review, Reviewed, Submitted by Harmonious, EIN received), EIN entry with the IRS letter upload required to mark it received.
- **BOI report** card (new): list of beneficial owners and company applicants picked from existing Fund/Client people (never creating duplicates), exemption check, status, submission date and FinCEN confirmation number recorded by staff.
- Each card shows who prepared it and who reviewed it; a different staff member must review before it can be marked submitted.
- Completing these updates Fund Setup completion % and auto-completes matching setup tasks.
- Fund managers see status only (no SSNs, IDs or owner details).

## Rules kept
- Record-only: no government filing, payment, or submission from the app.
- Maker-checker on every service record; history is append-only.
- Sensitive IDs stay in the existing encrypted storage; BOI owner ID numbers are not stored, only "provided / verified" flags plus document evidence.
- People come from canonical Person resolution; possible matches go to review, never merge.
- Ported ideas from the other Harmonious project are rebuilt on this project's models; no data copied.

## Technical details
- Migration: `fund_service_orders` (fund, kind formation|ein|boi, status, fields jsonb, preparer/reviewer, evidence doc ids), append-only `fund_service_order_events`, `fund_boi_parties` (person_id, role owner|applicant); grants + RLS staff-only, manager read of status via server fn.
- `src/lib/fund-services.ts` (pure status transitions, SOD checks) + `.server.ts` + `.functions.ts` gated by `funds:prepare` / review permissions via canonical authorize.
- Reuse `fund_entity_formation`, SS-4 generation and autoCompleteTasks; add readiness of these to the Fund Setup percentage.
- UI cards in the Entity & EIN and Administration & Regulatory sections; unit tests for transitions, SOD and masking; record rule in src/lib/AGENTS.md.
