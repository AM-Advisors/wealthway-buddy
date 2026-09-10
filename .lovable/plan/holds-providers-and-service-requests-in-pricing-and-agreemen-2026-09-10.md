# Holds, Providers and Service Requests in Pricing and agreements

Add three working tabs to the Pricing and agreements console so the Harmonious team
can run compliance holds, third-party provider records and additional-service
requests from one place, instead of only seeing their effects elsewhere in the app.

## What the team gets

The Pricing and agreements page keeps its three current tabs and gains three more:

**Holds** — the list of live holds, each showing what is paused (onboarding, wires,
distributions, filings, bank activity, document signing and so on), the client or
fund it applies to, the reason, when it was placed and by whom, plus the wording the
client sees. A "Place a hold" form picks the client and/or fund, what to pause, the
reason, an internal note, the explanation shown to the client and what would resolve
it. Each live hold has a "Clear" action that asks for a closing note. A toggle shows
cleared holds as history.

**Providers** — the record of every third party Harmonious depends on (banks,
identity checks, signing, storage, tax, filings): name, type, what service depends
on it, what categories of data it touches, contract status, security documentation
link, service level and current operating status with an outage note. Add a new
provider or edit any existing one inline. Providers already flagged as degraded or
down are pulled to the top so an outage is obvious.

**Service requests** — the existing review, quote, decline and activation queue for
additional services, surfaced here as well as on Clients and scope, so fee proposals
sit next to the rate card they come from.

Everything stays read-only for staff without contract authority: they can see holds,
providers and requests but the place/clear/save/quote controls are hidden, matching
how the rate card already behaves.

## Wording

Holds are described as pausing Harmonious activity pending review — never as a
regulatory finding or a legal determination. Provider records describe dependency and
status only. The out-of-scope sentence stays exactly:
"This service is not currently included in your active scope. Request service."

## Technical notes

- No database or server-function changes. `listHolds`, `placeHold`, `clearHold`
  (`compliance-holds.functions.ts`) and `listProviders`, `saveProvider`
  (`contracts.functions.ts`) already exist with staff/contract-authority checks and
  audit writes.
- New `src/components/holds-board.tsx` and `src/components/providers-board.tsx`,
  each a TanStack Query read plus mutations that invalidate their own key and
  surface errors through `sonner`.
- `src/routes/_authenticated/admin.pricing.tsx` gains three `TabsTrigger`/
  `TabsContent` pairs, passing `canManage` from the existing `getPricingBoard` read
  and reusing its `clients` and `funds` lists for the hold form; the service-requests
  tab renders the existing `ServiceRequestsBoard`.
- Hold scope and reason options come from the exported `HOLD_SCOPES` and
  `HOLD_REASONS` lists, so new options need no screen change.
