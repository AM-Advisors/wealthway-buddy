# Check fund documents for leftover {{ }} blanks

## What I already checked (read-only)
- Fund document text saved in the platform: no `{{ }}` found in any fund's documents.
- Side letter records and signing field setups: none found.
- Every one of the 68 saved fund document versions is a file (PDF/Word), so the text inside those files still needs to be checked. That is the main remaining step.
- When a draft is generated and a value is missing, it is written as `[name]` (for example `[management_rate]`) instead of `{{ }}`. Those need checking too.

## Plan
1. **Scan every current fund document file** (all funds, current and active versions, plus document templates) for `{{ }}`, `[placeholder]`-style blanks and other obvious leftovers like "XX" dates or "$[ ]". Signed copies and sealed versions are read only to report, never changed.
2. **Report back** a plain list: fund, document, version, which blank, and whether investors can currently see or sign it.
3. **Block it going forward**: before a draft can be approved or sent for signing, check its text for unfilled blanks and show "This document still has blanks to fill in: …" so the manager fixes it first. Existing approvals and signed history stay as they are.
4. **Fixing found documents**: for any affected unsigned document, prepare a corrected draft that goes through the normal approval. Nothing is published or sent automatically; signed originals are kept.
5. Add a small test that a draft with a leftover blank cannot be approved.

## Technical details
- Download files from storage server-side, extract text (pdf text / docx XML), regex `\{\{[^}]*\}\}` and `\[[a-z_]+\]`.
- Guard lives next to `generatedDocumentReviewError` (fund-document-generation-policy) and the signing start path; skip sealed versions via sealed-records.server.ts.
