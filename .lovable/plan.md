# One tax form question, then the tax form as the next step

## What changes for the investor

1. **Question 9 is the only tax form question.** The separate "Tax information" card in Sign goes away: "Are you a U.S. person?", "Country of tax residence" and "Country of citizenship". Question 9's answer, which comes from Verification (U.S. citizen or U.S.-formed business: W-9; other individual: W-8BEN; other business: W-8BEN-E), decides which IRS form is used.
2. **The IRS form comes right after the questions.** The order in Sign becomes:
   - Investor questions (1-24), then submit
   - The IRS form from question 9, then review, certify and sign
   - Subscription Agreement and the other documents

   The tax form stays locked until the questions are submitted. The Subscription Agreement stays locked until the tax form is signed.
3. **The form fills in from the answers.** The IRS form starts with what the investor already gave:
   - Name: Name of Subscriber (Q1), the verified name
   - Address: Subscriber's address of residence (Q5)
   - Business type / tax classification: from Q8
   - Country of citizenship or formation: from Verification

   These fields are shown so the investor can check them. The investor types only what we never collect in the questions: their SSN/EIN or foreign tax number, and their certification signature.
4. **Foreign business follow-ups stay, only when needed.** The W-8BEN-E questions about intermediaries, exempt status and U.S. trade income show only for a non-U.S. business, under the tax form. If the investor is unsure, Harmonious reviews it, the same as today.
5. **Investors who already signed a valid tax form** keep it. They see "Tax form on file" with Update, unchanged.

## Rules kept

- Tax ID numbers are still entered only in the protected tax form step and stored encrypted. They never go in the question answers.
- The server works out the form from Verification on every save. The browser can't change which form applies.
- Nothing is filed with the IRS.

## Technical details

- `onboard-compliance-panels.tsx`: `TaxSignPanel` drops the `TaxIntakeCard` U.S.-person, residence and citizenship questions. It shows only the foreign-entity follow-ups (capacity, exempt, effectively-connected) when the form is W-8BEN-E. It takes a `locked` prop until `questionnaire_submitted_at` is set.
- Server: the tax-intake state is derived from `subscriptionLocks` routing (the same `usPersonFromVerification` + `resolveTaxForm` path). The server writes the intake facts (`usPerson`, citizenship/residence country) from Verification, so `taxIntake.state` becomes valid without investor input.
- `previewTaxForm` / `certifyTaxForm`: prefill the legal name, address and classification from the questionnaire answers (Q1, Q5, Q8) on the server, read from the stored responses. The client-sent name falls back only when the answers are empty.
- `investor-onboarding-journey.tsx` Sign order: QuestionnaireForm, then TaxSignPanel, then the documents. The documents are gated on the tax form being signed when one applies.
- Tests: form routing equals the Q9 answer, the prefill mapping (Q1/Q5/Q8 into form fields), and the tax step locked until the questions are submitted.
