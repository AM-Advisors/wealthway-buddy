# Add new investors straight from the AI document reader

## What changes
When the AI reader on an investor finds a document that belongs to someone who is not on the fund yet, a new choice appears next to "It's this investor" and "Move here":

**Add as a new investor**

1. A short form opens, already filled from the document: name, investor type (person, trust, company, joint), email, phone, address, birthday, citizenship, entity name/formation details and signer. Each prefilled field shows which file and page it came from.
2. Staff review, fix anything, and click **Add investor**. If the email or name matches someone already on the fund, we show that match first and offer "Move here" instead, so no duplicate is made.
3. The investor is created on the same fund, the document moves to them, and the same review steps continue (approve/update/deny each detail, save, put to use).
4. In bulk uploads, files that name the same new person are grouped so one new investor gets all of them, not one record per file.

## Safety
- No email or invitation is sent. If an email was read, a "Send invitation" button appears afterward, using the normal personal-link sender.
- No email found is fine: the investor is saved without one (existing no-email rule).
- Tax and account numbers are still never read; identity documents still go through Verification review; nothing is marked signed, verified, accredited or funded.
- Only Harmonious staff and that fund's managers can add; the server checks access.
- Every add is recorded in the document's history ("Added as new investor from file X").

## Technical details
- `investor-document-ai.tsx`: add "Add as new investor" to the `needs` owner panel; new `NewInvestorFromDoc` dialog prefilled from `r.read.values` + `r.read.names`; group pending rows by normalized name/email.
- New server fn `createInvestorFromDocumentFn` in `investor-record.functions.ts`: requireSupabaseAuth (from `src/lib/require-auth.ts`), exact-fund authorization, duplicate check against fund onboardings by email/normalized legal name, then `createInvestor` (no invite), then reuse `confirmDocumentOwner` move logic and log `document_owner_new_investor` event.
- Pure helper `doc-to-new-investor.ts` mapping read values to the create payload (blank-only, no identifiers), with tests: maps name/type/email, drops tax IDs, groups files by same person, detects duplicate.
