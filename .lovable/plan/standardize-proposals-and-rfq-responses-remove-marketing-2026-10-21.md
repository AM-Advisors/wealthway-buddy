# Standardize proposals and RFQ responses, remove Marketing

Every proposal and RFQ response will be filled in by the platform from the quote, the published MSA and one approved About Harmonious paragraph. Reps won't write any of the standard sections, and Marketing won't take part.

## What changes

**Summary (locked):** Same fixed sentence built from the quote and the prospect, e.g. "Harmonious proposes White Glove Fund Administration for Roas Capital Management, prepared for Ross Vincent Mahoney." The optional one-line "Note from your Harmonious contact" stays underneath.

**Pricing (locked):** Built only from the quote lines:

- Each line shows the service, quantity, unit price, line amount and how often it's billed.
- A total is shown for each billing frequency. Today everything is added into one total, which is misleading when the lines are billed on different schedules.
- An annual-equivalent total is shown as well.
- The note "Pricing from the approved quote" stays.

**Terms (locked, now the MSA):** The Terms section is replaced by the MSA that is currently published (v3.0, effective Jan. 1, 2026). Its 12 numbered sections appear in order, from Services framework to General terms. The heading reads "Terms — Master Services Agreement v3.0".

- When Legal publishes a new MSA version, drafts pick it up automatically.
- Approved proposals keep the version they were approved with.

**About Harmonious (locked):** One standard paragraph, the same in every document. Marketing can no longer edit it. Only a Super Admin can update it, with a reason, and the version history is kept for good.

**Marketing removed from proposals:**

- The "Ask Marketing for help" panel and "Waiting for Marketing" panel are removed from the proposal page.
- The About Harmonious editor is removed from the Proposals & RFPs list. A small Super Admin-only version replaces it.
- Marketing roles lose read and edit access to proposals.
- The page description no longer mentions Marketing.
- Past Marketing requests stay in History; nothing is deleted.

**AI first draft:**

- On RFQ responses, the AI first draft box is hidden, because every section is now standard.
- On longer proposals, AI may still draft only the "What we handle" service descriptions. Prices are never AI-written.

Applies to the PDF, Word, email and on-screen copy alike.

## Technical details

- In `src/lib/sales-documents-model.ts`:
  - `lockedKeys` adds `terms` for both rfq and proposal.
  - Add `termsText(msa)`, which formats numbered MSA sections.
  - `pricingText` groups totals by `billing_frequency` and adds an annualized total.
  - `LockFacts` gains `msa: { version, effectiveDate, sections[] }`.
- `src/lib/sales-documents.server.ts` `lockFacts` reads the published `msa_versions` row with the latest `effective_date`, plus its `msa_sections` ordered by `sort_order`. `writeVersion` already applies the locks, so approved versions keep their snapshot.
- If no MSA is published, Terms shows "Terms will be provided in the Master Services Agreement," and submitting for approval is blocked.
- `getAboutHarmonious` / `saveAboutHarmonious`: saving is restricted to Super Admin; Marketing is removed from both.
- `requestMarketingHelp` / `returnMarketingAssist` are no longer called from the UI. The server functions are left in place but refuse new requests. The history table is unchanged.
- Update `src/routes/_authenticated/sales_.documents_.$id.tsx` and `sales_.documents.tsx` to remove the Marketing panels and hide AI draft for rfq.
- Update the "Proposal controlled sections" memory note.
- Tests in `sales-documents-locked.test.ts`:
  - Terms equals the MSA sections.
  - Totals are split by billing frequency.
  - Marketing cannot save About.
  - Typed terms are replaced.

## Open point

About Harmonious keeps the current paragraph, written from your Roas draft, until a Super Admin replaces it. Send the exact wording if you want it changed now.