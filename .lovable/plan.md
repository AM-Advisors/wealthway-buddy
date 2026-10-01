# Series LLC choices, EIN questions and SS-4 in "Launch a new fund or SPV"

All changes are on the Entity step of the client's new fund / SPV form.

## 1. Series LLC: choose where the series sits
When Vehicle / entity structure = **Series LLC**, a new required dropdown "Series LLC home" appears:

| Choice | What happens |
|---|---|
| HCAM TX | Jurisdiction set to **Texas** and locked |
| HCAM WY | Jurisdiction set to **Wyoming** and locked |
| AM SPV Fund Management | Jurisdiction set to **Delaware** and locked |
| Bring my own | Client fills in their existing Series LLC: legal name, jurisdiction, formation date, EIN (if any), manager/contact name and email, notes |
| Set up new | Client provides proposed master LLC name, jurisdiction, manager/contact, notes; a clear warning shows **"Harmonious charges $2,000 per year to manage a new Series LLC"** and a required checkbox to acknowledge it |

Switching away from Series LLC clears these answers and unlocks Jurisdiction. The $2,000 acknowledgment is recorded only — nothing is billed or charged automatically.

## 2. EIN questions
- **Already formed = No** → ask "Who will obtain the EIN?" — Harmonious / We will (client). Replaces the current "Has an EIN?" question in this case.
- **Already formed = Yes** → ask "Has an EIN?" (Yes → EIN number field; No → continue below).
- **Already formed = Yes, Has EIN = No, and Series LLC home is HCAM TX, HCAM WY or AM SPV Fund Management** → an **SS-4 section** appears for the client to complete.

## 3. SS-4 section
Pre-filled where we already know it (legal name, LLC = yes, state from jurisdiction, entity type, formation date, signatory as applicant), and the client completes the rest using the same SS-4 fields Operations uses: trade name, mailing/street address, county & state, responsible party name, LLC members, reason for applying, start date, closing month, employees/first wages, principal activity and line of business, previous EIN, third-party designee, applicant name/title/phone.

- The responsible party's SSN/ITIN is **not** collected in this form; Operations collects it through the existing secure vault step.
- On submission, the SS-4 answers prefill the Fund's EIN & SS-4 section in Fund Setup for Operations to review. Nothing is filed with the IRS.

## 4. Required-field checks and review
"Still needed" and the Review step show the new required answers (Series LLC home, bring-my-own / set-up-new details, $2,000 acknowledgment, EIN owner, SS-4 required lines). Operations sees all of it in the submitted request.

## Technical details
- `fund-request-model.ts`: add `series_home`, `series_existing{...}`, `series_new{...}`, `series_fee_ack`, `ein_obtained_by`, `ein`, `ss4{...}` to `FundRequest`/`emptyRequest`; jurisdiction derivation helper; `missingFields` rules; `offeringFieldsFor`/setup prefill maps `ein_path` (harmonious/client/existing) and passes SS-4 into the existing fund-entity SS-4 save path (strip any TIN), with `ss4_review_status` pending.
- `client.funds.new.tsx`: conditional UI on the Entity step, locked Jurisdiction, warning alert, SS-4 subsection, Review rows.
- Drafts keep saving the same way (JSON); older drafts load with blank new fields.
- Update `fund-request-model.test.ts` for jurisdiction mapping, conditional required fields and SS-4 trigger.
