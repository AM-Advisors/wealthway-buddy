# Providers, pricing expenses and holds queue

Three staff screens under Pricing and agreements, each with its own inline activity
history, all writing to the same contract audit trail already used by additional
service requests.

## What exists today

- Providers board and Holds board are already built and already record their actions
  to the contract audit trail.
- The rate card already supports pass-through line items.
- Nothing in the app displays the contract audit trail yet — the history is recorded
  but invisible.
- There is no record of actual third-party costs incurred.

## What gets built

### Pricing expenses (new)

A new "Expenses" tab with two parts:

1. Pass-through rate lines — the rate card filtered to pass-through items, editable in
   place (name, unit, amount, notes), same rules as the rest of the rate card.
2. Logged actual costs — a table of real third-party costs: fund, client, provider,
   the pass-through rate line it relates to, amount, date incurred, invoice or
   reference number, a note, and a billing status (unbilled, billed, absorbed, waived).
   Staff can add, edit and mark costs billed; a cost whose amount differs from the
   linked rate line is flagged so it can be reviewed before being passed on.
   Filter by fund, provider, status and date range; download as CSV.

### Providers (extend)

Keep the existing board and add: provider status at a glance, the ability to retire a
provider (never delete, so history stays intact), a link from each provider to the
expenses logged against it, and before/after values captured in the audit record.

### Holds queue (extend)

Keep the existing board and add a queue view: open holds first, sorted by age, with
filters by fund, scope and reason, an age indicator, and a required note when a hold is
cleared. Placing and clearing already writes to the audit trail; the clearing note is
added to it.

### Activity panel on every screen

Each of the three screens gets a collapsible "Recent activity" panel showing the last
entries from the contract audit trail scoped to that area (provider, pricing/expense,
hold), with who, when, what changed and before/after. Everything still flows into the
central audit screens unchanged.

## Access rules

- Any staff member can view all three screens.
- Only contract authority roles (legal, finance, compliance, client success, CEO, CRO,
  admin) can create or change providers, expenses, rate lines, or place/clear holds.
- Clients see none of these screens.

## Technical notes

- New table `pass_through_expenses`: client_id, offering_id (nullable), provider_id,
  pricing_item_id (nullable), amount_cents, currency, incurred_on, reference,
  note, billing_status, recorded_by, timestamps. RLS: staff read; contract-authority
  write; `service_role` full. GRANTs issued in the same migration.
- New `third_party_providers.retired_at` column; lists default to active providers.
- Server functions added to `src/lib/contracts.functions.ts` (or a sibling
  `expenses.functions.ts`): `listExpenses`, `saveExpense`, `setExpenseBillingStatus`,
  `retireProvider`, reusing the existing `audit()` helper and
  `requireContractAuthority`.
- `listContractAudit` gains an optional `area` filter and powers a new shared
  `<ActivityPanel area="..." />` component used by all three screens.
- Holds continue to use `compliance-holds.functions.ts`; `clearHold` gains a required
  note that is stored on the audit event.
