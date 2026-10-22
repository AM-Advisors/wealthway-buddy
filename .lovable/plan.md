# Harmonious payment details: separate from funds, CEO/CRO only

## What exists today
- Harmonious's own wire/ACH details (used on quotes, RFQs, RFPs and invoices) already live in their own place, Operations > Billing > Payment instructions, stored apart from each fund's banking.
- Right now Finance, Legal, Compliance, the CEO and admins can enter and approve them. The CRO can't.

## Changes
1. **Only the CEO and CRO can enter or approve** Harmonious's payment details. Finance, Legal, Compliance and admins lose edit and approve rights. They can still see that approved details exist (masked) but can't change them.
2. **Second person stays required:** if the CEO enters a version, the CRO approves it, and the other way around. The Super Admin rule doesn't change: self-approval needs a reason, and that reason is logged permanently.
3. **Clearer separation on screen:**
   - The page gets a new name, "Harmonious payment details (quotes & invoices)", with a note that fund banking is managed separately on each fund.
   - Fund banking screens get a matching note: "These are the fund's accounts, not Harmonious's."
   - The menu link only shows for the CEO and CRO.
4. **Nothing else changes:** clients still see masked numbers until they choose to reveal them, every view is logged, details are never emailed, and approved versions can't be edited. Fund banking keeps its current rules.

## Technical details
- `src/lib/sales-acceptance.server.ts`: set `REMIT_EDITORS` to `["executive", "cro"]` (the CEO is `executive`) plus `super_admin` for the logged-reason exception. Update the error text. The existing `remittanceApprovalBlocker` still enforces a different approver.
- `src/lib/ops-capabilities.ts`: show the menu entry only to the executive and CRO roles.
- `ops.billing.payment-instructions.tsx`: change the title and copy. Non-editors get a friendly "CEO or CRO only" message.
- Fund banking pages: add a one-line note only.
- Add a test to confirm that only the executive, CRO and super_admin roles can edit, and that finance, legal and admin can't.
- Record the rule in memory (payment detail authority).
- No database changes.
