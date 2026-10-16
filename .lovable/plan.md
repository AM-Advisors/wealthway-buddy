# Simpler fund setup: EIN and Banking in Fund Details, finished sections become summary boxes

## What changes for staff and fund managers

### 1. EIN in Fund Details
- Fund Details gets a simple **EIN** row:
  - type the EIN (formatted XX-XXXXXXX)
  - **Upload IRS letter** (CP 575 or 147C, PDF or image)
- Saving it fills in the EIN everywhere it's used today, including the Texas Capital Bank / Mercury bank setup requests. The letter is filed in the fund's Documents and noted in Audit History.
- The "Who is getting the EIN?" choice and the SS-4 steps only show while no EIN is on file, under a small "Don't have an EIN yet?" link. Once an EIN and letter are saved, they're hidden.
- Fund managers' EIN entries still go to Harmonious for review, as today. Staff saves go straight to the fund record.

### 2. Banking the same way
- Banking gets the same simple layout:
  - bank name
  - account name
  - last 4 digits of the account
  - **Upload bank letter** (bank verification letter or wire instructions)
- Full account and routing numbers still go through the existing verified wire-instructions entry on the Banking tab, never shown in full here. The letter is filed in Documents and logged.
- "Who opens the account?" (fund themselves, or Harmonious with Texas Capital Bank or Mercury) only shows while banking isn't done, under "Need a bank account?".

### 3. Cleaner setup page
- Each section shows only the fields it needs, in a single column on phones, with one **Save** button at the bottom of the section. The duplicate Save at the top of each section and the sticky "Save all" bar go away.
- Required fields are marked, and a short "2 of 5 filled in" note sits next to each section title.

### 4. Finished sections become permanent boxes
- When a section is saved and complete (or approved by Harmonious, for fund manager changes), it turns into a read-only **summary box**. The box shows the saved values, a "Complete" tick, who saved it and when.
- When every section is complete, the setup checklist and progress bar are removed from the page. The fund page shows only the summary boxes, grouped as Fund Details, EIN, Banking, Team & Signatory and Documents.
- **Editing is separate:** each box has an **Edit** button that opens that section in a side panel. It has its own Save and Cancel, and saving there is logged in Audit History.
- Locked or launched funds keep their current rules: edits go through the existing locked-edit approval.
- A fund manager's edit to a completed section goes to Harmonious for review. The box keeps showing the approved values, with a "Change waiting for review" label.

## Not changing
- Who may save, approve or launch.
- SS-4 signing and filing: still manual.
- No bank account is opened and no money moves.

## Technical details
- Reuse `saveFundEinFn` and the existing fund file upload (`uploadFundFileFn`), adding the categories `ein_letter` and `bank_letter`. Add a small `saveBankSummaryFn` that stores the bank name, account name and last 4 on the offering's banking record. The last 4 come from the verified wire instructions when those exist.
- `src/lib/fund-setup-form-model.ts`: add an `ein` section and a `bank` section, plus `sectionComplete(section, values, files)` — a pure function with tests: EIN complete = valid EIN plus a letter; bank complete = bank name, last 4 and a letter.
- `src/components/fund-setup-form.tsx`: render a `SummaryBox` when a section is complete and an `EditSectionSheet` (shadcn Sheet) for edits. Hide the setup chrome when every section is complete. `EinChoice` and `BankingChoice` move behind the "not done" links.
- Completion and the launch % keep coming only from `fund-launch-summary.ts`. EIN and bank-letter completeness feed into it, so the number stays the same everywhere.
