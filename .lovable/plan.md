# Side letters, close pricing, and archived documents for fund managers

Parts 1 and 2 are the already-approved plan (side letters reference the Operating Agreement and Subscription Agreement; close requests count side letters at $1,500 each, minus already-paid ones). This adds Part 3.

## 3. Archived documents view for fund managers

On the fund's Documents tab, add an "Archived & earlier versions" section (collapsed by default) listing:
- Documents that were removed/archived (e.g. the Roas GP LLC Operating Agreement), with archived date, who archived it and the recorded reason.
- Earlier versions of current documents (e.g. Erebor Operating Agreement v2 once v3 is in use), labeled "Replaced by vN".
- Copies "signed before joining Harmonious" stay labeled as such.

For each item, an "Applies to" column shows which investors it still governs:
- Investors who signed or acknowledged that exact version (name, signed date) — it remains their binding copy even though it's archived.
- "No investors" when nobody signed it.
- Side letters show their one investor.
- Clicking the count expands the investor list; each investor links to their investment page.

Read-only: managers can view and download their entitled files; nothing can be restored, deleted, or re-signed from here. Harmonious staff see the same section.

## Technical details

- New server function in `src/lib/fund-tabs.server.ts`/functions: authorized exact-fund manager or staff read of `offering_documents` with `removed_at` set plus non-active versions, joined to recorded signature/acknowledgment rows per version and to side-letter registry investors; returns names only for that fund's investors.
- Pure helper `src/lib/archived-document-applicability.ts` grouping signatures by document/version; tests for: signed-old-version investor listed, unsigned archived doc shows none, pre-platform signed copy kept separate.
- UI component `src/components/fund-tabs/archived-documents.tsx` mounted in `documents-tab.tsx`, downloads via existing OfferingDocumentReader entitlement.
- Add to roadmap.md; AGENTS.md rule that archived views are read-only projections of recorded signatures.
