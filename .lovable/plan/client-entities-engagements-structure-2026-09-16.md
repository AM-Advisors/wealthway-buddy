# Client → Entities → Engagements structure

Today an agreement can only hang off a fund: a client has a master agreement, and each statement of
work points at one fund record. There is nowhere to record a management company, a GP, a series, or
a holding company, and the commercial side (billing frequency, discounts, effective date) is spread
across price lines rather than stated once per engagement.

This restructures contracting around the three layers you described, without discarding anything
already signed.

## 1. Master relationship (already exists, gets a home)

One page per client showing the master agreement, its amendments, and client-level terms that apply
to every engagement: notice period, billing contact, default billing frequency, payment terms,
default discount. Signed master agreements stay exactly as they were signed.

## 2. Entities

A new register under each client. Every entity has a type — Company, Fund, SPV, Series, GP,
Management Company, Other — plus legal name, jurisdiction, formation date, tax ID status, parent
entity, and status (planned, forming, active, closed).

- Entities can nest: a series sits under its fund, a fund sits under its management company.
- Each existing fund becomes an entity of type Fund, linked to its current fund record, so fund
  pages, documents and investors keep working untouched.
- A fund or SPV request from the client portal creates the entity in "planned" state.

## 3. Engagements

An engagement is one agreement for one entity (or, where it applies across the whole client, for no
entity). It replaces the bare statement-of-work record as the unit everything hangs off:

**Service package** — the services in scope, their deliverables, and any service-specific terms,
carried over from the existing service catalogue and entitlements.

**Commercial terms** — priced lines as now, plus, stated once on the engagement: billing frequency
(one-time, monthly, quarterly, annual, per event), discount (percentage or fixed, with the reason),
effective date, and first invoice date. Invoicing reads these instead of guessing from line types.

**SOW / order** — the document itself: sections, version, stage, execution snapshot. Unchanged from
what is already built.

**Changes / amendments** — the existing change requests and amendments, now scoped to the
engagement.

**Signatures** — unchanged.

**Service delivery** — a per-engagement delivery view pulling together what already exists
elsewhere: onboarding progress, compliance items and holds, documents, open tasks, and an overall
delivery status (not started, onboarding, live, paused, closing, closed).

## Screens

- Client page gains three sections: Master relationship, Entities, Engagements.
- New entity page: details, parent/children, the engagements covering it, and its delivery status.
- Engagement page with the six tabs above, for staff; the client sees the same engagement in their
  portal with the review, change and sign flows already built.
- Fund requests become entity requests, with the type chosen up front.

## Technical notes

- New `client_entities` (client_id, type, legal_name, jurisdiction, formation_date, parent_entity_id,
  offering_id nullable, status, tax id fields) and `client_engagements` (client_id, entity_id
  nullable, sow_id, package/commercial fields: billing_frequency, discount_kind, discount_value,
  discount_reason, effective_date, first_invoice_date, delivery_status). Both with GRANTs, RLS
  matching the existing client/staff split, and updated_at triggers.
- `client_sows` keeps its columns and becomes the SOW/order inside an engagement, via
  `client_engagements.sow_id`. `offering_id` on the SOW stays for backwards compatibility.
- Backfill: one entity per existing offering, one engagement per existing SOW linked to that entity,
  billing frequency inferred from the SOW's current pricing model, discount null.
- `service_entitlements`, `sow_pricing_snapshots`, `agreement_change_requests`, `sow_amendments`,
  `agreement_signatures` and `agreement_executions` keep pointing at the SOW; the engagement reads
  through it, so nothing signed moves.
- `fund_requests` gains `entity_type` usage as the entity type and an `entity_id` link.
- New `src/lib/entities.functions.ts` and `src/lib/engagements.functions.ts`; new routes
  `/admin/clients/$clientId/entities`, `/admin/entities/$entityId`, `/admin/engagements/$engagementId`,
  and a client-side engagement view reusing the existing agreement components.
- Invoice generation reads billing frequency and discount from the engagement instead of per-line
  assumptions; executed pricing stays immutable.
