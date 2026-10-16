# Harmonious SPV templates: pick, pull down, autofill

## What changes for the user
- In SPV setup, the Documents section gets a **Use Harmonious template** choice for the **Operating Agreement, PPM and Subscription Agreement** (next to "Upload my own").
- Picking it pulls the latest approved Harmonious version of each document into the fund, filled in with the fund's details, and opens it in the pop-out viewer.
- Before generating, a checklist shows every blank the template needs and whether the fund already has it. Anything missing links straight to the field in **Fund Details**.
- **New Fund Details fields** are added for anything the three templates ask for that the platform doesn't record today (found in step 1 below — likely items such as investment/asset name, offering size per unit, closing date, governing law state, manager notice address). Each is optional and saved per section like other fields.
- If details change later, a **Refresh from fund details** button makes a new version of the document; earlier versions are kept and Audit History logs it.
- Signer setup stays as today: Operating Agreement fund manager only; Subscription Agreement investor first, then fund manager; PPM is read-only (no signature).
- Anything still unknown stays as a highlighted blank for review. Nothing is sent to investors automatically.

## Steps
1. Read the three approved SPV templates and list every blank they contain; match each to an existing fund record field.
2. Add Fund Details fields for blanks with no match, shared by the staff and fund manager Setup page.
3. Extend autofill to cover all blanks (including headers/footers), with the "needs / have" checklist.
4. Add the template choice and Refresh button in Setup → Documents for SPVs.
5. Test on Dev Test 1: generate all three, confirm no blanks left where data exists, signers correct.

## Technical details
- Autofill: extend `fundTemplateValues` in `src/lib/fund-doc-templates.server.ts`; new columns on `offerings` (nullable, additive migration), added to `src/lib/fund-setup-form-model.ts` Fund Details section.
- New server fn `templatePlaceholderReport(offeringId, templateId)` returns needed/filled/missing keys; staff and authorized fund managers only, checked server-side.
- Generation reuses `useTemplateInFund` (approved versions only, new fund document version, audit entry, `autoSigningSetup`). PPM category gets no signing config.
- Refresh creates a new version; never overwrites a signed version.
