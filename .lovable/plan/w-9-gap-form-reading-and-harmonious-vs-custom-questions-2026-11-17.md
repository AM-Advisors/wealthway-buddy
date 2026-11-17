# W-9 gap, form reading, and Harmonious vs Custom questions

## What the two screenshots show

- **Tax form: Complete.** The W-9 was uploaded and marked "completed outside the platform", so that step counts.
- **Tax classification: Waiting on investor.** This is a separate check. It only clears when the tax questions are answered on the platform, or when a W-9/W-8 is signed on the platform. An uploaded W-9 doesn't count yet.
- So the investor is asked to "Confirm tax status on the tax form" and "Send tax form to sign", even though the W-9 is already on file. That's the gap: the details are on the uploaded form, but nobody has read them into the record.

## 1. Close the gap for uploaded W-9s (fix now)

- When an accepted W-9/W-8 is on file, Tax classification uses its details and stops asking the investor.
- If the form's details haven't been entered yet, the step reads "Waiting on Harmonious or manager: confirm details from the uploaded W-9" instead of asking the investor to sign again.
- The "Send tax form to sign" button is hidden when an accepted tax form already exists.

## 2. Read uploaded forms and fill in the details

- When a W-9, W-8BEN/W-8BEN-E, ID, formation document or bank letter is uploaded, the platform reads it and suggests the details: name, entity type, tax classification, address, signature date, and the last 4 digits of the tax ID.
- Suggestions show side by side with the document. Staff or the fund manager clicks **Confirm** or edits each one. Nothing is saved to the investor's record without that click.
- Suggestions only fill blank fields. They never overwrite details already entered, and they never count as the investor's own certification.
- Full tax ID numbers stay protected. They are stored encrypted and never shown in full or written to logs.
- Each confirmation records who confirmed it, when, and which document version it came from.
- Rollout order: W-9 first, then W-8, then IDs and entity documents.

## 3. Investor questions: Harmonious Template or Custom

- In Setup, Investor questions starts with one choice: **Harmonious Template** (standard, ready to use) or **Custom**.
- **Custom** opens the existing question builder, including the AI that drafts questions from the fund's agreements.
- **Save to library:** a custom questionnaire can be saved for that client. The client's team members on their funds can reuse it on a future fund.
- Reusing a saved questionnaire makes a fresh copy for the new fund, which still goes through that fund's normal approval. Editing the copy never changes the saved version or past answers.
- Saved questionnaires are visible only to that client's team and to Harmonious staff, never to other clients.

## Open questions

- Should the form reader suggest all fields, or only the ones the platform already asks for? (Planned: only those.)
- Can a fund manager confirm the read details on their own, or does Harmonious confirm? (Planned: either one, following the current routine-approval rule.)

## Technical details

- readiness-presentation.ts and investment-readiness.ts: tax_classification becomes satisfied by an accepted tax-document record with confirmed classification. tax-upload-state.ts provides the shared lookup.
- New document_extractions table: document id/version, suggested fields as JSON, status (suggested/confirmed/rejected), confirmed_by/at. Grants plus RLS cover staff and exact-fund managers. TIN fields are ciphertext using the existing encryption approach.
- Extraction runs in a server function through the Lovable AI Gateway, which sends the document to a vision model and checks the output against a strict per-form schema. Confirmation writes through the existing investor-record save/review path and subscription-prefill.ts blank-only rules.
- Questionnaire source: add a mode (harmonious_template | custom) to the fund questionnaire section. New client_questionnaire_library table (client_id, title, pinned question-set version, created_by), with client-scoped RLS. Reuse copies into a new draft version for the target fund.
- Tests: an accepted W-9 clears classification; extraction never overwrites a filled field; the library can't be read across clients.
