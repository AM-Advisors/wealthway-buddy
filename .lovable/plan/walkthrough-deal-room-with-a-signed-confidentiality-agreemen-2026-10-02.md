# Walkthrough deal room with a signed confidentiality agreement

## Current state (checked)
- The Portal Walkthrough Fund I has no deal room and no deal room documents.
- No investor sign-in is linked to the fund, so no one can sign the confidentiality agreement or see the investor tabs yet.

## What gets built
1. **Deal room content (synthetic, clearly marked as test material).** Six generated PDFs, each with a "Walkthrough sample - not a real offering" banner:
   - Executive summary
   - Investment memo
   - Financial model summary
   - Term sheet
   - Fund structure chart
   - Risk factors

   They are uploaded through the app's existing deal room upload, so they get normal versions and access rules, not database shortcuts.
2. **Deal room settings.** The room is opened to investors, the standard confidentiality agreement is attached, and a few sample Q&A questions are added.
3. **Test investor.** A synthetic investor sign-in (walkthrough-investor@harmonious.test, never emailed) is linked to the fund through the normal onboarding record at the "Sign" step with a $50,000 commitment.
4. **Sign the agreement.** In the preview, I sign in as that investor and sign the confidentiality agreement through the real signing screen, so the signature, version, and time are recorded the normal way.
5. **Check the investor tabs** and screenshot them:
   - Investment information
   - Documents
   - Deal room, with documents now visible
   - Messages

## Boundaries
- Everything is labelled as test material. No real company data, no emails, no funding or money movement.
- The signature is a synthetic test signature on the walkthrough fund only.

## Technical details
- PDFs are generated with reportlab and visually checked before upload, then uploaded through the existing diligence upload server function as the walkthrough manager. That writes the storage objects, diligence_documents, and versions.
- The investor auth user, person, investment_profile, and investor_onboardings rows are created through the existing manual investor entry path (investor-record service), then claimed on sign-in. No hand-written rows for anything the app derives.
- The confidentiality agreement is accepted through the UI (diligence_nda_acceptances / signatures), not inserted directly.
