# AI reader for Fund Setup

## What you get
A **Read fund documents with AI** box at the top of Fund Setup. Drop in one or many files (Operating Agreement/LLOA, PPM, Subscription Agreement, side letters, EIN letter, SS-4, wire instructions, formation certificate, term sheets). The AI reads all of them together and fills in the setup details it finds.

For each detail it shows:
- **Already matches**: the fund already has this value. No action needed.
- **Suggested**: the box is empty or has a different value. You get **Approve**, **Deny** and **Update** buttons, the same as the investor AI reader.
- **Conflict**: two documents disagree, for example the PPM says 0.25% and the LLOA says 2%. Both values and the documents they came from are shown, and you choose one.

Each suggestion names the document and page it came from.

## What it fills in (grouped by setup step)
- **Fund details:** legal name, fund type, state, Series LLC and master entity, GP or manager, signatory and title, registered agent and address, fiscal year end, arbitration venue, target raise, minimum investment
- **Fees and terms:** management fee (rate, basis, payment terms), carry, preferred return, classes and amount ranges, hurdles. These save as a **draft** and still go through the normal approval.
- **Tax:** EIN and the name on the EIN letter. A mismatch with the fund's legal name gets flagged.
- **Banking:** bank name and beneficiary only. Account and routing numbers are never read or saved by AI. Wire details still have to be entered and verified the usual way.
- **Investor questions:** eligibility rules (accredited or qualified purchaser), passed to the existing custom-question drafter.
- **Documents:** each file can also be added to the fund's Documents under the right category with one click. It is added as a new version that still needs approval.

## Safety rules (unchanged authority)
- Nothing saves until a person clicks Approve or Update. A typed value is never overwritten without a click.
- Fees and terms stay drafts. Legal name changes go through the existing name-change history.
- Bank numbers, tax IDs other than the fund EIN, and personal ID numbers are never returned.
- Only Harmonious staff or that fund's own managers can use it, the same people who can edit setup.
- Files are read in memory and never stored unless you choose "Add to Documents".
- Every approved, updated or denied detail is logged with its source document.

## Technical section
- `src/lib/fund-doc-extract-model.ts` (pure): JSON schema per setup field, normalize/redact, merge across documents with conflict detection, compare against current setup values, map each field to its canonical save path.
- `src/lib/fund-doc-extract.server.ts`: authorize with the existing fund setup check (staff or exact-fund manager), call the default Responses model through `@lovable.dev/ai-gateway` with strict schema and PDF input, add source/page citations, add a redaction pass.
- `fund-setup-canonical.functions.ts`: `readFundSetupDocumentsFn` and `applyFundSetupSuggestionFn` (approve/update/deny). Apply routes to the existing savers only: `saveFundSetupFields`/`saveFundSetupDetails`, `changeLegalName`, `saveFundEconomics` (draft), `recordEin`, banking-path/bank-name fields, `createSetupDocument` + `uploadDocumentVersion`. Each uses a stale-value guard and records an append-only setup event with source doc and page.
- `src/components/fund-setup-ai-reader.tsx`: bulk drop (up to 15 files), progress, grouped results with Approve/Deny/Update/Choose-between controls. Mounted at the top of `fund-setup-canonical.tsx`. QA sandbox mock added.
- Tests: merge/conflict detection, redaction of account and tax numbers, "never overwrite without approval", fees always land as a draft.
