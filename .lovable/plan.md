# Deal review before commitment

## Current state (checked)
- The investor link page (`/invest/<fund>`) shows only the fund name, short description, minimum investment and a "Start or continue your investment" button.
- A full deal room already exists (documents, confidentiality agreement, Q&A), but investors only reach it from their fund page after they already have an investment started.
- Fund assets and offering terms (fees, carry, target raise, closing dates) exist, but are not shown on the investor link.

## What gets built
A **"Review this deal"** page on the investor link, shown before the investor commits:

1. **Deal overview** - fund name, asset(s) being invested in, target raise, minimum investment, target close, open/closed status.
2. **Key terms** - the published offering statement (fees, carried interest, preferred return, term, capital calls, distributions). Drafts never show.
3. **Fund documents** - the deal room documents (memo, PPM, operating agreement, subscription agreement preview, etc.), view-only, behind the fund's confidentiality agreement when the fund requires one. Every view is recorded for the manager.
4. **Questions** - investors can ask the fund manager a question from the same page.
5. **Commit** - a clear "I've reviewed this deal - continue to invest" button at the bottom that starts the normal About You → Verification → Sign → Fund steps. Reviewing creates no commitment and no investment record.

Signed-out visitors see the overview and minimum only, with "Sign in to review documents". Documents and terms require sign-in.

## Manager side
- On the fund's Deal room tab, a "Show before commitment" switch per document (default on for memo/PPM/terms, off for anything marked internal).
- A preview link: "See what investors see".

## Boundaries
- Viewing never signs anything; the fund's own subscription documents still need signatures inside the Sign step.
- Closed or not-launched funds show the review page but no Commit button.
- No new money, filing or approval paths.

## Technical details
- New public route section in `src/routes/invest.$slug.tsx`; reuse `DiligenceRoom` document list/NDA components, `OfferingStatementView`, and `fund-assets` data rather than new engines.
- New server function `getDealReview` (requireSupabaseAuth) returning only published statement, assets summary and pre-commitment-visible documents; NDA check reuses `getDiligenceAccess`/`acceptDiligenceNda`.
- First step: verify current deal-room read rules for a signed-in user with no onboarding; add a narrow read policy/flag (`diligence_documents.show_pre_commitment`, default by category) via migration if needed.
- Views logged through the existing `recordRoomVisit`.
- Tests: pre-commitment visibility rule (hidden docs and draft terms never returned; closed fund returns no commit eligibility).
