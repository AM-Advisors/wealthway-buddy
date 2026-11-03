# Manager-led fund work and review emails

## Outcome
Fund managers and explicitly designated teammates can manage and approve routine work on their own fund without a Harmonious handoff. The person responsible for a pending review receives an email linking to the exact item. Harmonious retains visibility into stalled work.

## Fund-team control
- Add a designated routine reviewer option to the existing Team & Access controls, limited to the selected fund.
- Existing Viewers and Assistants keep their current access. No automatic upgrades or manager/signatory rights.
- Managers explicitly designate or revoke reviewers. Revoked, expired or no-longer-authorized grants stop working immediately.
- Enable the existing fund screens and save/review actions for authorized routine reviewers, not a second workspace or approval queue.
- Cover routine fund details, fees and terms, additional questions, fund-document drafts and versions, side-letter records and ordinary investor supporting-document reviews.
- Keep one explicit authorized approval for routine work, including the authorized preparer's own routine draft where the existing policy permits it.

## Review emails
- Send after the exact pending item/version is successfully saved or submitted for review, never while typing or on page load.
- Route to one authorized responsible reviewer: an explicitly assigned eligible teammate, otherwise the responsible fund manager. Do not broadcast to the whole team.
- Include fund name, the action needed and a link to the exact review item. Omit private screening evidence, tax IDs, banking details and internal notes.
- Use event-specific duplicate protection and the existing managed sender. Email failure does not undo saved work; suppression remains respected.
- Preserve existing investor invitations, signing emails and funding notices without duplicating them. Do not email old pending items automatically during implementation.

## Boundaries
This removes routine Harmonious handoffs, not protected controls. Identity, background screening, accreditation, banking verification/release, investor admission/funding, access grants, tax/financial releases, required signatures and money movement retain their existing authorization. No automatic approval, filings, payments or retrospective document changes. Signed and sent copies remain pinned to their recorded versions.

## Technical approach
- Extend fund-team grants with an explicit exact-fund routine reviewer role and shared server-side capability checks; never make reviewers appear in fund_managers or use a broad self-serve impersonation grant.
- Audit each routine server save/review boundary and its UI controls together; distinguish routine fields from protected identity/signatory/bank/tax/service-level fields.
- Reuse canonical setup, economics, question, document and side-letter engines and existing fund review views.
- Extend event-bound notice patterns with a shared routine-review recipient resolver and a fixed branded review template; no new email queue or blanket send endpoint.

## Verification and release
- Test same-fund access, cross-fund denial, existing role limitations, expired/revoked grants, grantor authority and protected-action denials.
- Test exact pending-version routing, designated reviewer/fallback manager selection, stable duplicate keys and resolved-item suppression.
- Verify prepare → pending review → approval in fictional QA without touching real investor records or sending test emails to clients.
- Confirm previews compile and distinguish verified behavior from any durable checks blocked by isolated-QA requirements.
- No live grants, retroactive approvals, unsolicited emails or deployment during implementation. Publish when requested.