# Rebuild Operations "Set up fund"

## What changes for the user
Today, "Set up new fund" / "Add Fund or SPV" opens a small inline form (name, client, type, offering route). After that, staff have to open the fund and fill in the rest separately.

After this change:
- Operations staff and Account Managers who click **Set up new fund** go to a full setup page. They can enter every detail in one place before creating the fund.
- The page uses the same white, sectioned layout as the existing fund Setup page: Basic Details, Fund Details, Jurisdiction, Offering, Fees & Terms, Team & Signatory, Banking, Documents, Review & Launch.
- **Fund Details** now opens with these three fields, in this order:
  - **Fund name** (required)
  - **Raise amount ($)**
  - **Minimum commitment ($)** (required)
  - followed by EIN, formation date, open date and close date.
- These three fields also move to Fund Details on each fund's existing Setup page, which staff and fund managers share. They come out of Basic Details and Offering, so no field shows up twice.
- Client, Fund Type and Form D Type stay required in Basic Details, as they are today.
- One button, **Create fund**, creates the fund and saves every filled-in field at once, then opens the new fund's page. Fields left blank show as "Missing" on that page, like they do today.
- Only people who can prepare funds today (Operations, Account Managers, Super Admins) see the button and can save. The server checks this, so changing the screen can't get around it.

## What stays the same
- The fund is still created as a closed, non-public draft. Nothing is filed, published or opened to investors.
- Duplicate-name checks, fee seeding, pricing snapshots and the "created" entry in Audit History all work as they do now. Each saved section also adds its own Audit History entry.
- Fund managers still submit their changes for review. Staff saves still go straight onto the fund.

## Technical section
- New route `src/routes/_authenticated/ops.fund-setup.new.tsx` renders `FundSetupForm` in a new `mode="create"`, with a Client picker added to Basic Details. "Set up new fund" in `ops-funds-dashboard.tsx` and "Add Fund or SPV" in `ops.fund-setup.index.tsx` both link to it. The inline form is removed.
- `src/lib/fund-setup-form-model.ts`: add `name` to the Fund Details section, and move `targetRaise` and `minInvestment` there (relabelled "Raise amount ($)" and "Minimum commitment ($)"). The keys and save sections don't change.
- New server function `createStaffFundWithDetails` in `staff-funds.functions.ts`. It runs the existing `createStaffFund` logic (same `requireOperations("funds","prepare")` check), then applies the `changedBySection` payload through the existing staff section-save path for that fund. If a section fails to save, the fund still exists; the error names the section and the user lands on the fund to finish it.
- Saving `name` updates `offerings.name` through the existing duplicate-name check and records the change in the fund's name history.
- Tests: model test that Fund Details holds name, raise and minimum, and that no key appears in two sections; server test that someone without the prepare permission is refused.
