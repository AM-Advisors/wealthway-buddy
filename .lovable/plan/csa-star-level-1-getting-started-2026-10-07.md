# CSA STAR Level 1: getting started

## What STAR Level 1 is
A free, public **self-assessment**. Harmonious answers the CSA's security questionnaire (CAIQ v4), which covers 17 security areas and about 260 questions built on the Cloud Controls Matrix (CCM v4). You then upload the completed questionnaire to the CSA STAR Registry yourself. There is no auditor and no certificate. It is a published statement that has to be accurate and should be refreshed every year.

## What we build
A new **CSA STAR** tab in Compliance & Controls:

1. **Questionnaire workspace.** Load the official CAIQ v4 spreadsheet (a free download from CSA, linked on the page). Every question appears grouped by its security area. For each question you choose Yes, No or Not applicable, write an explanation, and mark who is responsible: Harmonious, the customer, or shared.
2. **Draft answers from what's already recorded.** Where an existing control, policy or evidence item covers a question, a suggested answer appears with links to that proof. Every suggestion stays a draft until a person accepts it. Anything without proof is suggested as "No" or left blank, never "Yes".
3. **Gap list.** Questions answered No or left blank, grouped by area. Each gap can become a task for its owner.
4. **Progress.** Answered, reviewed and approved counts for each area, plus an overall readiness percentage.
5. **Review and sign-off.** Answers follow the same review rules as the rest of the page. A second person reviews them, or a Super Admin self-approves with a written reason. All history is kept permanently.
6. **Export.** Download the completed questionnaire in the CAIQ spreadsheet layout, ready to upload to the STAR Registry. You do the submission yourself. Harmonious never submits on its own.
7. **CCM mapping.** CCM is added as a framework alongside SOC 2, ISO 27001 and GDPR. Existing controls are linked to CCM areas, so one piece of proof can support all four frameworks.

## Honest limits
- The page and the public Security statement will never say "STAR certified". Level 1 is self-assessed. Once your registry entry is live, you can link to it.
- About 22 controls exist today, so expect many first-pass gaps. The usual early ones are a risk assessment, business continuity testing, vendor agreements, encryption and key management write-ups, and logging and monitoring.
- Several CAIQ questions are about the hosting environment. Those answers will be marked "shared" and point to the hosting provider's own published evidence, not claim it as Harmonious's.

## What I need from you
- The CAIQ v4 spreadsheet. CSA requires a free account to download it, so please attach it here. Without it I can set up the 17 areas but not the official question wording.
- The person who owns the STAR submission.

## Technical details
- New tables: `star_assessments` (version, status, owner, submitted_at set manually), `star_questions` (CCM control id, domain, question id, text, imported from the uploaded xlsx), and append-only `star_answers` (answer, explanation, responsibility, linked control/evidence ids, status draft/reviewed/approved, author, reviewer, reason). Grants plus RLS follow the existing `administration.controls.*` permissions.
- The CAIQ xlsx is parsed server-side with the existing spreadsheet import utility. Question ids are kept verbatim so the export round-trips.
- Suggestions come from rules first: control mappings to CCM ids, with optional AI wording drafts through the Lovable AI Gateway that cite evidence ids. A "Yes" requires linked evidence.
- Review uses the existing maker-checker and self-approval helpers.
- The export writes back into the CAIQ column layout as xlsx.
- CCM rows are added to `compliance_requirements` (framework "CSA CCM v4"), with mappings to existing controls.
