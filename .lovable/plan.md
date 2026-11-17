# Custom names for fund documents

## What changes
1. **Name any document when adding it.** For the Operating Agreement, Subscription Agreement and PPM, the "Add" button gets an optional name box, for example "Corps Erebor Operating Agreement (Amended)". If you leave it blank, it keeps the standard name. "Other" documents work as they do now.
2. **Rename documents already loaded.** Every document card in Offering Documents gets a **Rename** button. It opens a small box with the current name, and you press Save. This works for all past documents, whatever type they are.
3. **The new name shows everywhere the document's name appears:** the fund's Documents tab, the investor's document list, send windows, change requests and previews.
4. **History is kept.** Renaming changes only the label. File versions, approvals, signing setup and investors' signed copies stay exactly as they were. Each rename is recorded with the old name, the new name, who changed it and when.

## Who can rename
- The same people who can already edit that fund's documents: Harmonious staff, or that fund's own managers.
- No approval step is needed, because the label is not a money, identity or signature change.

## Rules
- The name is required and can be up to 200 characters.
- The document type (Operating Agreement, Subscription Agreement, PPM, Other) does not change, so readiness checks and signing rules keep working.
- Signed PDFs already given to investors keep the name they had at signing.

## Technical details
- `createSetupDocumentRow` in `offering-document-setup.server.ts` accepts an optional `title` for every category; falls back to `DOCUMENT_CATEGORY_LABELS`.
- New `renameSetupDocument(userId, { documentId, title, expectedTitle })` with the same edit authorization as `createSetupDocument`, refusing sealed or removed documents and stale renames. Updates only `offering_documents.title` and writes an append-only rename record (existing document event/audit table if one fits, otherwise a small new `offering_document_title_history` table with grants and RLS, read-only to staff and that fund's managers).
- New server function plus an optional name input and a Rename dialog in `offering-documents-setup.tsx`; refresh with the existing fund document queries.
- A test for the rules: blank name refused, standard name used when blank on add, and the type unchanged on rename.
