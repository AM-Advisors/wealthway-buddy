# Fund fees and share price on invoices

Today a fund's wire fee, closing cost and share price only reach an invoice if someone
sets them by hand on that fund. Every fund created through client onboarding starts at
zero, so its fees show as $0 and billing is blocked. Share price is never billed at all.

## What changes

### 1. New funds start on the client's agreed rate
When a fund is created (including funds created from a client's fund details submission),
the wire fee and closing cost are copied from the client's agreed rate on their active
statement of work. If there is no agreed rate, the published standard rate card is used.
Each fund records where the amount came from, exactly as the fee panel already shows.

If neither an agreed rate nor a standard rate exists, the fund still starts at zero and
the fund page shows a clear warning that the rate must be set before fees can be billed.

### 2. Existing funds sitting at zero get corrected
Funds that currently have a zero wire fee or closing cost, and are linked to a client with
an agreed rate, are updated once to that rate and stamped with its source. Funds with a
deliberately entered amount are left alone.

### 3. Zero fees are visible, not silent
On the fund's payments screen, any fee earned while the rate is zero is listed with a
"Rate not set" marker and a link to the fee settings, instead of quietly counting as $0
towards the totals.

### 4. Share price becomes a billable subscription line
When a closing is recorded, the fund payments screen also shows a subscription item for
that investor: units at the fund's share price. Units come from the funded amount divided
by the share price; the amount billed is units times share price, with any remainder
shown so nothing is lost silently. Funds with no share price set show the funded amount
itself and a "Share price not set" marker. These items can be selected and put on an
invoice exactly like wire fees and closing costs, each one billable only once.

## Technical notes

- `src/lib/fee-rates.server.ts`: add a helper that returns the applicable fee amount and
  source for a client (agreed rate, then published standard card).
- `src/lib/offerings.functions.ts` (`saveOffering` create branch) and the fund creation in
  the client intake flow: seed `wire_fee_cents` / `closing_cost_cents` plus their
  `*_source` and `*_rate_id` columns from that helper. Existing update behaviour, which
  only writes fields the screen sent, stays as it is.
- One-time data update for existing zero-fee funds with an agreed rate on file.
- `src/lib/fund-billing.functions.ts`: add a `subscription:<closingId>` event built from
  `application_closings.funded_amount_cents` and `offerings.share_price_cents`, carrying
  units, unit price and remainder; keep the existing `source_ref` uniqueness so a closing
  can only be billed once. Replace the blanket "one of these fees is zero" error with a
  per-item check that names the fee and the fund whose rate is missing.
- `src/components/fund-payments.tsx`: show the subscription items, the units and unit
  price, and the "Rate not set" / "Share price not set" markers.
- Invoice lines gain `subscription` alongside `wire_fee` and `closing_cost` as a fee kind
  so the existing invoice, approval, payment and audit flow carries them unchanged.

No changes to permissions, scope gating or who may approve and pay.
