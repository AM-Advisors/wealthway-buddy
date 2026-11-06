# Document tags, sections and clean-check

## What you'll get
1. **Sections** on both the Investor 360 documents area and the fund documents page, showing the same records:
   - Subscription & signature
   - Tax forms (W-9/W-8, K-1)
   - Fund docs (PPM, OA, side letters)
   - Identity & accreditation
   Each section shows the current document first. Older copies fold away under "Past versions".
2. **Tags** on every document:
   - Automatic: **Past version** (replaced), **Signed**, **Prior tax year** (e.g. "2025"). These come from the existing records, so they can't be wrong or edited by hand.
   - **Custom staff tags**: staff can add and remove their own labels (for example "Needs re-send"). Staff-only, logged, never shown to investors.
3. **Connected to Investor 360**: each document row links to its investor's Investor 360 page and the exact investment. Investor 360 links back to the fund page section.
4. **Clean check** (report only, changes nothing): a "Document check" panel lists
   - duplicate copies of the same document
   - documents filed under the wrong investor or fund
   - more than one "current" version of the same document
   Each issue links to the document so staff can fix it themselves.

## Unchanged
Signed originals, sealed versions and history stay as they are. Sealed documents remain hidden. No access is widened.

## Technical details
- New table `document_staff_tags` (document ref, tag text, created_by, created_at, removed_at) with GRANTs, RLS staff-only via existing role check; additions/removals append audit events.
- Shared pure model `src/lib/document-sections.ts`: classify document kind into one of four sections; derive automatic tags (superseded, signed from canonical signature records, tax year).
- Shared reader `document-library.functions.ts` (requireSupabaseAuth from src/lib/require-auth.ts) used by both Investor 360 and fund documents page; filters sealed versions via sealed-records.server.ts.
- `document-clean-check.ts` pure detector (duplicate file hash/kind+party, party/fund mismatch vs investment record, multiple current versions); read-only report.
- Unit tests for section classification, auto tags, and the three clean-check rules.
- Run the check once against live data and share findings.
