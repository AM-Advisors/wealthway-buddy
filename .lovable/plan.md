# One fund setup for Harmonious and fund managers

## Goal
Harmonious staff and fund managers use the same Fund Setup page, laid out like the "Add Fund" reference: a simple form of collapsible sections, on a clean white background.

## Layout (follows the reference)

```text
[<]  Fund setup — <Fund name>                [Cancel] [Save]
------------------------------------------------------------
v Basic Details
    Fund Nick Name *
    Fund Legal Name *
    Fund Manager *        (select)
    Fund Employee         (select)
    Fund Type *           (select)
    Entity Type *         (select)
    Form D Type           (506(b) / 506(c) / other)
v Fund Details
    EIN (masked, eye to show last 4)   Close Date(s) (calendar)
v Jurisdiction
    Country   State
> Offering         (target raise, minimum, open/close, rolling closes)
> Fees & Terms     (management fee, carry, preferred return, classes)
> Team & Signatory (signatory, fund manager, Harmonious team)
> Banking          (wire details; last 4 only for managers)
> Documents        (PPM, Subscription Agreement, LLOA - SPV templates)
> Review & Launch  (what's missing, launch readiness %)
```

- Style: white background, light gray borders, rounded inputs with labels inside the field, navy section titles, a teal Save button (Harmonious brand). No dark panels, gradients, or KPI tiles.
- Each section header shows a small status: Done, Missing N, or Waiting on review.
- One sticky header bar with Back, Cancel and Save. Save stores all changed fields at once.
- Works on phone width as one column.

## Same page, role-appropriate actions
- **Harmonious staff:** Save writes directly to the fund record, like today.
- **Fund managers:** Save submits the changed fields for Harmonious review, using the existing review path. Fields awaiting review show "Waiting on review", and returned fields show Harmonious's note.
- **Staff-only extras:** these appear at the bottom of the same page, inside a "Harmonious only" section: Fill from Drive suggestions, EIN/SS-4, tax documents, sign-off queue and the Operations launch checklist. Fund managers never see them, and each still checks permissions on the server.
- The Operations Setup tab, the Operations fund manager view and the fund manager's own Setup page all render this one page. The old six-step guided card, the separate Fund Setup editor and the legacy manager setup loader stop being shown, though their saving logic is reused.

## Out of scope
- No change to who can approve what, money handling or bank number storage. Managers still see only the last four digits.
- The client "Launch a new fund or SPV" request form stays as it is.

## Technical details
- New `src/components/fund-setup-form.tsx` (mode `staff | manager`). It reads the existing canonical setup data (`fund-setup-canonical` loader plus guided step statuses) and maps each field to its existing save function: the canonical save for staff, and the fund-manager submission for managers.
- Field-to-record mapping: Nick Name to `name`, Legal Name to `legal_entity_name`, Fund Manager to `gp_entity_name` or contact, Fund Employee to a fund team member, Fund Type to `fund_type`, Entity Type to `entity_type`, Form D Type to `reg_type`, EIN to the existing encrypted EIN field (masked), Close Date(s) to `offering_close_date` plus close records, Country/State to `state_formed`.
- Replace usages in `ops-fund-page.tsx` (Setup tab), `manager.fund.$fundId.settings.tsx`, `manager.fund.$fundId.index.tsx` and `admin.fund.$fundId.tsx` (setup tab). Keep the old components in place, unused, and remove them in a later cleanup.
- Add AGENTS.md rule: one shared fund setup form for staff and managers; mode only changes the save path, never authority.
- Verify with a typecheck and unit tests for the field mapping. Browser check is limited by two-step sign-in.
