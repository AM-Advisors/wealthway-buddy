# One "Services" tab + checkbox fund assignment for people

## 1. Services tab (replaces "Agreements & Services" and "Client access")
One tab called **Services** with four clearly labeled sections down the page, plus a small jump bar at the top:

```text
Services
[ What they have ] [ Agreements ] [ Billing & payments ] [ Access ]
```

1. **What they have:** one card per service (Fund Administration, Cap Table, Wealth, Foundation…) showing status (Active / Pending approval / Not included), price and billing cadence, and its on/off access switch right on the card. Add service button here.
2. **Agreements:** MSA status and SOWs/quotes with signed dates (the existing contracts list).
3. **Billing & payments:** invoices, payments received and balance due, card autopay, and the setup fee waiver. Read-only views of existing billing records; no money moves.
4. **Access:** areas that aren't tied to one service (Agreements, Banking, Tax, Documents, Billing, Messages) as simple on/off switches, the change history, and "View as client".

Cleaner option: putting the access switch on each service card means "they don't have Cap Table" and "they can't see Cap Table" are the same switch, so you don't have to set it in two places. Old links to the previous tabs open the matching section.

## 2. People & Team: checkboxes instead of dropdowns
For each person, replace the "Associate with fund… / Role / Add" dropdowns with:
- A **role** choice (Fund manager, Signer, etc.) shown as checkboxes.
- The client's funds listed as **checkboxes**, with a **Select all funds** box at the top.
- One **Save** button that adds the newly ticked funds and removes the unticked ones, with a confirmation that shows what will change.

These remain relationship labels only; they never grant logins, fund access, signing or money authority (unchanged).

## Technical details
- `ops-records.ts`: collapse `services` + `access` into `services` ("Services"); keep `access`/`contracts` as hidden aliases scrolling to sections.
- `ops-record.tsx`: Services tab renders sections with ids and a sticky jump bar; reuse `ClientServicesPricingPanel`, `ClientServicesPanel`, `ClientContractsPanel`, `SetupFeeWaiverCard`, `ClientTabAccessPanel`, `ClientViewAsCard` and an existing invoice/payment reader for the client.
- `client-tab-access.ts`: map service keys to tab keys so service cards show their switch; the Access section lists only the unmapped areas.
- `client-admin.tsx`: replace `ScopeAdder` with `FundScopeChecklist` (role checkboxes × fund checkboxes + select all), diffing against current scopes and calling existing `setClientPersonScope` add/remove per change.
- Small test: select-all diff produces the right adds/removes.
