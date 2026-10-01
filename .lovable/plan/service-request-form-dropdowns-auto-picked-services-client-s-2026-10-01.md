# Service request form: dropdowns, auto-picked services, client status view

Applies to the "What would you like to do?" request form (Launch an SPV / Launch a Fund) and the client's Services page.

## Form changes

1. **Investment / asset type** becomes a dropdown: Startup / private company equity, Real estate, Private credit / debt, Fund interest (fund of funds), Secondary shares, Crypto / digital assets, Other (with a text box).
2. **Vehicle / entity structure** becomes a dropdown: Delaware LLC, Delaware Series LLC (series), Delaware LP, Wyoming LLC, Cayman exempted company, Other. It is **auto-picked** from the service card the client clicked (Launch SPV → Delaware LLC, Launch Fund → Delaware LP; Real estate fund → Delaware LLC). The client can still change it.
3. **Main services auto-selected**: choosing the vehicle (or the auto-pick) ticks the core package for that structure — entity formation, EIN, operating/LP agreement, subscription documents, investor onboarding, Form D & Blue Sky (when the exemption needs it), banking setup. These appear in a "Included with your setup" group (can be unticked).
4. **A la carte add-ons** show underneath as a separate list (tax, K-1s, fund administration, cap table, BOI, audit support, etc.), ticked individually. Prices still come only from the rate card; final list/price confirmed by Harmonious.
5. **Jurisdiction** dropdown: Delaware, Wyoming, Nevada, Texas, New York, Cayman Islands, BVI, Other.
6. **Offering exemption** dropdown: 506(b), 506(c), Reg CF, Reg A (Tier 1), Reg A+ (Tier 2), Not sure.
7. **Investor eligibility field removed.** An info box under the exemption shows the matching rules automatically, e.g.:
   - 506(b): unlimited accredited, up to 35 non-accredited sophisticated; no general solicitation.
   - 506(c): accredited only, verification required; general solicitation allowed.
   - Reg CF: open to all, annual investment limits for non-accredited; via a funding portal.
   - Reg A / Reg A+: open to all; Tier 2 non-accredited limited to 10% of income/net worth.
   The chosen eligibility is saved with the request so it stays in sync with the exemption. Labelled "general guidance — counsel confirms."
8. **Expected close** uses a calendar date picker.
9. **Management fee** and **Carried interest / promote**: each gets a `%` / `$` toggle next to the amount (applies to the Fund forms' fee fields too).

## Client view after sending

On the client's Services page, each submitted request opens a detail view showing:
- The answers they gave (editable while status is "Waiting on Harmonious"; edits are logged, not overwritten).
- The selected core and add-on services.
- A step list: Request received → Harmonious scoping → Proposal / SOW sent → Client approval → Setup started, with each Harmonious-owned step marked **"Harmonious — pending"** until staff move it forward.
- No new access or gates: same client membership checks as today.

## Technical details

- `src/lib/client-portal-model.ts`: add `kind: "choice"` options for investment_asset, vehicle_structure, jurisdiction; new `EXEMPTIONS` with eligibility text; drop `investor_eligibility` from `SPV_SETUP_SCHEMA` (derived instead); add `kind: "fee"` for management_fee / carried_interest / promote / performance_allocation storing `{value, unit: "%"|"$"}` as `"2%"` / `"$25000"` strings in answers.
- New pure map `VEHICLE_CORE_SERVICES` (vehicle + exemption → rate-card service keys) in `client-portal-model.ts`, with unit tests.
- `client.services.request.tsx`: render fields by `kind` (Select, Popover+Calendar, fee toggle), set default vehicle on intent pick, auto-tick core keys, split services into "Included" and "Add-ons", write `investor_eligibility` from exemption on submit.
- Client request detail: extend `client.services.index.tsx` list + new detail route `client.services.request.$requestId.tsx` reading the existing intake request via a client-scoped server fn; edits go through a new `updateIntakeAnswers` server fn (client member check, only while pending, append-only change row). Step statuses derived from the existing request status — no new status values.
