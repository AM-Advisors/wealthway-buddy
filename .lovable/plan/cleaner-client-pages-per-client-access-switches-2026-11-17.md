# Cleaner client pages + per-client access switches

## Goal
One clear home for each client relationship (MSA, funds, investments, team, connections) on both the staff Client page and the client's own app, plus a simple panel where staff turn each tab and service on or off. Anything switched off is hidden completely from the client.

## 1. Staff Client page (Operations)
Reorganize the current page (today: tabs on top, then several stacked cards underneath) into clear tabs with a summary header:

- **Header:** client name, status, Sales/Account manager, MSA status (signed / not signed, date), counts of funds, investments, people. One "Next step" button.
- **Overview:** relationship map: client, its entities, funds/SPVs, companies, key people and the Harmonious team, each clickable. Recent activity below.
- **Agreements:** MSA, SOWs, quotes in one list with status and signed date.
- **Funds & Investments:** funds/SPVs with raised/funded amounts and investor counts.
- **Companies / Cap Tables**, **Wealth** (only shown when they have it).
- **People & Team:** client contacts, signatories, Harmonious team, with "Add connection".
- **Documents**, **Billing**, **Activity**.
- **Access (new):** see section 3.

Cards now floating below the tabs (View as client, Services, Setup fee waiver, Timeline) move into their matching tab. Larger text, plain labels, no dense tables on the first screen.

## 2. Client's own app
- Same simple structure in their menu: Home, Agreements, Funds, Investments, Cap Table, Wealth, Team, Documents, Billing.
- Home shows their relationship at a glance: MSA, funds, team contacts, next step.
- Only tabs switched on for them appear. Hidden tabs also refuse to open if typed in directly.

## 3. Access panel (staff only)
A list of every client tab and service with an On/Off switch:
- Agreements, Funds, Investments, Cap Table, Wealth, Banking, Tax, Reporting, Documents, Billing, Team, Foundation (when enabled).
- Default for each switch follows what they've purchased; staff can override with one click (no second approver), and each change is logged with who and when.
- If Cap Table or Wealth is off, those pages, menu items and links vanish for that client and the server refuses access.
- "Preview as client" button to check what they'll see.

## What stays the same
Fund-level permissions, signatures, money and identity checks, and signed history are untouched. Switching a tab off never deletes data; switching it back on restores it.

## Technical details
- New table `client_tab_access` (client_id, tab_key, enabled, updated_by, updated_at) + append-only `client_tab_access_events`; RLS: staff write, client members read their own.
- Pure model `src/lib/client-tab-access.ts`: effective access = override ?? entitlement default; shared by `client-sidebar.tsx`, client route guards (server-side check in loaders/server functions), and the staff panel. Unit tests for: Cap Table off hides + denies, Wealth off hides + denies, override beats purchase default.
- Extends existing `menu_gating` / `filterByEntitlements` rather than a second engine; update the AGENTS.md rule.
- Staff page: regroup `RECORD_TABS.client` in `ops-records.ts`, move cards from `ops.clients.$clientId.tsx` into tabs, add Access tab and relationship map in `ops-record.tsx`.
- Verify with Playwright in the QA sandbox (MFA blocks live staff pages).
