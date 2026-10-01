# Phase 3 (continued): Full formation records in Fund Setup

## Goal
Bring the other project's nine formation record types into each Fund's **Entity & EIN** section, built on this project's Fund, Person and Operations-services records. Fund managers see one combined, read-only view of the formation for their Fund. Harmonious staff fill in and review the records. Nothing is filed, paid or sent to any state or provider from the app.

## The nine record types and where each one goes

| Other project | Here | Who sees it |
|---|---|---|
| Formation order | Builds on the existing Entity formation service: jurisdiction, entity type, legal name (taken from the canonical Legal Name, never retyped), processing speed, name-check result, state file number, formation date, action-required flag and reason | Staff edit; manager sees status, state, type, dates, action needed |
| Formation documents | Versioned formation files (articles, certificate, operating agreement, good standing, other), each new upload adds a version and nothing is replaced. The current certificate stays as the proof needed to complete formation | Staff upload; manager sees titles, dates, and can open approved files |
| Timeline events | One history per Fund combining the existing service events, plus a "show to manager" flag on each entry | Staff see everything; manager sees only flagged entries in plain wording |
| Authorization certification | The client's written authorization for Harmonious to form the entity: who gave it, when, exact wording, registered-agent choice. Append-only. Required before formation can move to "Submitted by Harmonious" | Staff record; manager sees who authorized it and when |
| Providers | Staff list of formation / registered-agent providers (record only, no connection to a provider) | Staff only; manager sees the chosen provider's name |
| Service prices | State fee, expedite fee, provider fee by state and entity type, marked verified or unverified. Harmonious's own fee still comes from the rate card | Staff only |
| Bundles | Formation packages (with registered agent, EIN, operating agreement, expedite) linked to the existing Expected Services catalog, not a second price list | Staff only; manager sees the package name |
| Order financials | Cost snapshot per Fund (state fees, provider cost, customer total), recorded once and then locked | Staff with commercial access only; never managers |
| Sync conflicts | Kept as **manual discrepancy notes**: staff record where a provider's record differs from ours and settle each one explicitly. No automatic polling or overwriting | Staff only; manager sees "Harmonious is confirming a detail" |

## What fund managers will see
A single **Formation** panel on their Fund page and in Fund Setup: status step, state and entity type, provider name, authorization given (who/when), document list with dates, action-needed note, and the shared timeline. They never see costs, margins, provider prices, internal notes or confirmation numbers.

## Rules kept
- Record-only: no filing with any state, IRS or FinCEN, no provider ordering, no payments.
- Maker-checker continues: someone other than the preparer reviews before "Submitted by Harmonious".
- History, authorizations, document versions and cost snapshots are append-only; mistakes are corrected by adding a new entry.
- Legal name comes only from the canonical Legal Name; people only from existing Person records.
- Fund managers only see their own Funds, checked on the server.
- No data is copied from the other project, only the design is reused.

## Technical details
- Migration: extend `fund_service_orders` (formation kind) with nullable columns, plus new tables `fund_formation_documents`, `fund_formation_authorizations`, `formation_providers`, `formation_service_prices`, `formation_bundles`, `fund_formation_costs`, `fund_formation_discrepancies`; add `manager_visible` to `fund_service_order_events`. All tables get GRANTs and RLS limited to staff; managers read only through server functions. Append-only triggers on authorizations, document versions, costs and events.
- `src/lib/fund-formation.ts` (pure: visibility mapping, transition guard requiring an authorization) + `.server.ts` + `.functions.ts`, using the existing `setupActor` and canonical authorize checks. Costs are limited to staff with commercial access.
- UI: expand the Formation card in Entity & EIN; add a staff "Formation reference data" screen under Funds & SPVs (providers, prices, bundles); add the manager Formation panel to the manager Fund page.
- Tests: manager masking, authorization-before-submit, append-only enforcement, cost visibility for Sales vs managers. Add a rule to src/lib/AGENTS.md.
