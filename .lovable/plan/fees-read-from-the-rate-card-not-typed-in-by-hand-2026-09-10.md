# Fees read from the rate card, not typed in by hand

The rate card, client rates and statements of work already live under Pricing and agreements. The gap is that
several fees are still typed in elsewhere, one fund at a time, with no link back to what the client actually
contracted for. This closes that.

## What is typed in by hand today

- **Wire fee and closing cost** are entered on each fund's edit form. They drive what investors see and what is
  deducted on the cap table, but nothing connects them to the client's agreed rates.
- **Service request quotes** — when Harmonious prices an additional service, the fee is typed from scratch each
  time, even though that client already has a contracted rate for it.
- **Per-investor wire fee overrides** on the cap table stay as they are; those are deliberate one-offs.

## What changes

**Funds pick their rate instead of typing it**

On the fund edit form, wire fee and closing cost each become a picker: the client's contracted rate, the standard
rate card rate, or "set a rate just for this fund". Picking a rate copies the amount and records which rate it came
from, so the fund page and cap table keep working exactly as they do now. A fund set to a contracted rate shows
where that rate came from and when it took effect. Choosing a one-off rate requires a short reason, which is written
to the audit trail alongside who changed it.

**Existing funds keep their current amounts** and are shown as "set just for this fund" until someone chooses a
contracted or standard rate — nothing changes silently.

**Quotes start from the agreed rate**

When staff quote a service request, the screen suggests the client's contracted rate for that service, falling back
to the published standard rate. The person quoting can accept the suggestion or override it; an override asks for a
reason. Which rate was used is stored on the request and appears on the signed amendment.

**A rate is visible wherever money is shown**

The fund's Fees area and the cap table show a small "from the client's agreed rates / standard rate card / set just
for this fund" note next to the amount, so nobody has to guess whether a number was contracted or improvised.

**One place to see mismatches**

A new "Where fees come from" panel on the rate card tab lists every fund whose wire fee or closing cost does not
match the client's contracted rate, with the difference and a one-click way to bring it in line. This is how you
find prices that were set before this change.

## Language

Amounts and rate sources are shown as recorded facts. Nothing implies Harmonious sets, approves or advises on what
a client should charge. Funds outside an active statement of work continue to show:
"This service is not currently included in your active scope. Request service."

## Technical notes

- `offerings` gains `wire_fee_source`, `wire_fee_rate_id`, `closing_cost_source`, `closing_cost_rate_id` and a
  reason column for one-off rates. Existing rows backfill to `custom`, so `wire_fee_cents` / `closing_cost_cents`
  stay the single source of truth for calculations — no read path changes.
- A resolver in `src/lib/contracts.functions.ts` returns the applicable rate for a `(client, service key)` pair:
  active-SOW client rate first, then the published rate card, then none. Reused by the fund form, the quote form
  and the mismatch panel.
- `saveOffering` in `src/lib/offerings.functions.ts` accepts the source fields, copies the amount from the resolved
  rate when a source is chosen, requires a reason for `custom`, and writes a `contract_audit_events` row.
- `quoteServiceRequest` records `fee_source` and `fee_rate_id`; the board pre-fills from the resolver.
- New `FeeSourcePanel` on the rate card tab, plus source badges in `cap-table-board.tsx` and the fund fee display.
- Contract authority (legal, compliance, finance, client success, executive, admin) is required to change a fee
  source or set a one-off rate; other staff see it read-only.
