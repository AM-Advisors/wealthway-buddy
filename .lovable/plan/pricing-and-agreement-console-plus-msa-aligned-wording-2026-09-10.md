# Pricing and agreement console, plus MSA-aligned wording

Two pieces of work: an admin console where fees and engagement terms are edited on screen instead of in code, and a wording pass over the home dashboard and fund pages so nothing on them implies a service or role Harmonious hasn't agreed to.

## 1. Pricing and SOW console

A new admin page, **Pricing and agreements**, with three tabs.

**Standard rate card**
- List every rate version (draft or published) with its effective date.
- Add, edit and remove line items: name, service it maps to, category, how it's charged (one-time, per year, per investor, pass-through), amount, unit, and the condition it applies under ("over $1m", "each additional close").
- Start a new version by copying the current one, edit the copy, then publish it. Published versions stay readable, so a fee change never rewrites history.
- Pass-through items (state and Blue Sky fees) are marked as such rather than given an amount.

**Client rates**
- Per client: the standard amount alongside the contracted amount, a note for why it differs, and the version and start date it came from.
- Falls back to the published rate card when no client-specific amount is set.

**Statements of work**
- Full editor for each engagement, not just title and type: status (draft, active, terminated), effective and termination dates, notice period, scope summary, fee summary, deliverables and timing notes.
- Per-SOW condition overrides — investor cap, permitted exemptions, lead times, approval gates — so one client's terms differ without touching the platform defaults.
- Activating or terminating a SOW is a recorded decision with the person and time captured.

Everything here writes to the existing contract audit trail. Only staff with contract authority (admin, legal, compliance, client success) can change anything; other staff see it read-only.

## 2. Wording audit

Pass over the home dashboard, the manager fund page, the admin fund page and the fund setup screens, replacing anything that reads as if Harmonious performs a professional or fiduciary role by default.

Rules applied:
- Filing, tax, valuation and legal items are described as coordination and support, with the client or their named provider as the one responsible — never "we file", "we prepare", "we value".
- Money movement is described as facilitation against client instructions, never custody, escrow or holding funds.
- Anything not in the active scope shows the exact required line: "This service is not currently included in your active scope." with a request option, rather than a working-looking button.
- Third-party steps (bank, state, IRS, verification vendor) are labelled as theirs, so timing isn't presented as a Harmonious commitment.
- Each fund page carries the short standing note about which roles Harmonious does not take on unless a SOW says otherwise.

Every replacement is copy only — no change to what the pages actually do.

## Technical notes

- New routes: `/admin/pricing` (tabs for rate card, client rates, SOWs). Sidebar entry added next to "Clients and scope".
- Reuses existing server functions in `src/lib/contracts.functions.ts`: `getPricing`, `savePricingItem`, `createPricingVersion`, `publishPricingVersion`, `saveClientPrice`, `saveSow`. Adds `deletePricingItem`, `archivePricingVersion`, and extends `saveSow` input to cover notice days, scope/fee summaries and per-SOW eligibility overrides.
- SOW eligibility overrides write to `client_sows.eligibility`, already read by `src/lib/eligibility.functions.ts`, so condition checks pick them up with no extra wiring.
- New components: `pricing-catalog-board.tsx`, `client-pricing-board.tsx`, `sow-editor.tsx`.
- Wording pass touches `src/routes/_authenticated/home.tsx`, `src/components/manager-fund-home.tsx`, `admin.fund.$fundId.tsx`, `admin.setup.tsx` and the fund compliance card; gating uses the existing `ServiceGate` component.
- No schema migration needed unless the SOW editor needs a column that doesn't exist; the plan uses the current `client_sows`, `pricing_versions`, `pricing_items` and `client_pricing` tables.
