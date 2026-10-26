# Accreditation proof: clear options + ask a professional to upload

## What investors will see (accreditation proof page, 506(c) funds)

1. **"What can I provide?" chooser** above the upload box, one card per way to qualify:
   - **Income:** last 2 years of W-2s, 1099s, K-1s or tax returns, plus a note that you expect the same this year.
   - **Net worth:** bank, brokerage or retirement statements from the last 3 months, plus a credit report for debts.
   - **Professional license:** Series 7, 65 or 82 license record.
   - **Entity:** financial statements showing over $5M in assets, or proof all owners are accredited.
   - **Letter from a professional:** a signed letter from a CPA, attorney, registered investment adviser or broker-dealer confirming accreditation within the last 90 days.
   Choosing a card sets the verification method and fills in the matching document types for the upload list, so investors know exactly what to upload.

2. **"Ask my CPA, lawyer or adviser to send it"** option:
   - Investor enters the professional's name, firm, role (CPA, attorney, investment adviser, broker-dealer) and email, then clicks Send request.
   - The professional gets a branded email with a private, single-use upload link (expires in 14 days). The page shows only the investor's name and fund name, plus a sample letter they can follow.
   - The professional uploads the signed letter and confirms their license number. No account needed.
   - The investor sees the request as "Sent / Uploaded / Expired" with Resend and Cancel buttons.
   - When the letter is uploaded, it joins the investor's evidence, accreditation moves to review, and the fund manager or Harmonious is alerted like today. Review and approval stay the same: an upload never approves anyone.

## Safeguards
- Only the investor can send a request for their own investment. Requests are limited (3 open at once, 5 sends a day).
- The upload link reveals nothing else about the investor: no amounts, tax ID or other documents. PDF/image files only, 15 MB max.
- Every request, send, upload and cancellation is logged permanently.

## Technical details
- `src/lib/accreditation-evidence-options.ts` (pure): basis → required document kinds, labels, help text; tests.
- New table `accreditation_professional_requests` (application_id, onboarding_id, requested_by, professional name/firm/role/email, token_hash, status requested/uploaded/expired/canceled, expires_at, uploaded_document_id, timestamps); grants + RLS (investor reads own rows, writes via server only).
- `accreditation-professional.server.ts` + `.functions.ts`: create/resend/cancel (requireSupabaseAuth, ownership check), with idempotent `sendTemplateEmail("accreditation-professional-request")`.
- Public route `src/routes/verify-accreditation.$token.tsx` + server route `src/routes/api/public/accreditation-upload.ts`: verifies hashed token, expiry and status; uploads to the existing private accreditation storage; inserts an `accreditation_documents` row (`verification_letter`); sets review status; calls existing `notifyAccreditationPending`.
- Update `onboarding.accreditation.tsx` with the chooser and request panel; add tests for token validation, ownership and rate limits.
