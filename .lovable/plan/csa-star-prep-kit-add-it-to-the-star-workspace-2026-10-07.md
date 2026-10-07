# CSA STAR Prep Kit: add it to the STAR workspace

## What's in the upload
The zip holds 8 CSA reference PDFs:
- Program Overview
- Program Knowledge Guide (13 MB)
- CCM and CAIQ FAQ
- STAR Registry FAQ
- Assessment Portfolio FAQ
- Extended FAQ
- STAR Enabled Solutions FAQ
- Assurance Education FAQ

It does **not** include the CAIQ v4 questionnaire spreadsheet, which holds the actual questions. So the CSA STAR tab still can't load any questions. The kit is guidance, not an assessment.

## What gets built
1. **Reference library on the STAR tab.**
   - The 8 PDFs are stored privately, staff-only like other evidence. Each is labelled "CSA reference — not Harmonious evidence".
   - Each opens through a short-lived link, and every open is logged.
   - None of them count as evidence for any control. They never change a STAR answer or readiness number, and never appear on the public Trust Center.
2. **Level 1 checklist** on the STAR tab, using the steps CSA describes in the kit:
   1. Choose the Level 1 path. This is the self-assessment; the third-party audit is Level 2.
   2. Download the CAIQ from CSA and load it. This step stays open until the questionnaire is loaded.
   3. Answer every question, with each answer approved by a second person.
   4. Optionally complete the GDPR self-assessment. CSA offers it alongside Level 1.
   5. Export and submit through CSA's online portal. Submission is always done by a person.
   6. Record the CSA quality-check result (Valid-AI-ted or manual review).
   7. Record the public Registry link once it's live.

   Steps 2, 3, 5 and 7 tick themselves off from data already on the tab. Steps 1, 4 and 6 are ticked by a person, with their name and the date.
3. **Framework card:** the CSA STAR card on Frameworks gets a "Prep kit loaded" note and a link to the checklist. Its readiness number does not change.

## Not doing
- Nothing is copied from the PDFs into answers, controls or policies.
- Nothing is submitted to CSA.
- The kit is not shown publicly, and it's not used to claim STAR status.

## Technical details
- **Files:** go to the existing private evidence storage under `reference/csa-star/`, uploaded once by a one-time script. The `__MACOSX` and `.DS_Store` junk files are skipped.
- **New table:** `star_reference_documents` (title, path, size, sha256, uploaded_by). Server access only.
- **Checklist history:** manual steps reuse `star_assessment_events` with new event kinds `path_chosen`, `gdpr_done` and `quality_result`, all append-only.
- **Permissions:** the same as the STAR tab (`administration.controls.view` and `.edit`). Opening a file is logged to the evidence access log.

## Still needed from you
- The **CAIQ v4.1 spreadsheet** (.xlsx). Download it from cloudsecurityalliance.org with a free CSA account, then upload it here or on the STAR tab.
- The **person who will own the submission**.
