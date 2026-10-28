# One approval, without repeated handoffs

## Requested result
Replace routine two-person approval requirements throughout Harmonious with **one explicit approval by a person already authorized to approve that item**, including when that person prepared it. Consolidate repeated review buttons and handoffs. Saving a draft or generating it with AI does not approve it.

## Internal work
- Apply one-person approval to routine fund setup, fees and terms, custom-document questions, document versions, side letters, nonfinancial internal requests and marketing content.
- Keep existing role and exact-client/fund restrictions. Editing permission alone does not grant approval permission.
- Record the actor, version, time and existing required reasons in permanent history. Preserve validation, source-document approval, version locks and stale-draft checks.
- Where the same version is approved once, downstream screens reuse that approval instead of requesting another internal approval for the same decision.
- Do not approve pending ROAS documents, classes or questions automatically as part of changing the rule.

## Agreements and signatures
Approvals and signatures are different. Remove **workflow-only** extra countersign requirements for future MSA/SOW and fund-document versions where the actual agreement permits completion with the remaining signer(s).

- Check the recorded agreement wording and required signers before enabling a single-signature version.
- Where a contract still requires both parties, retain the signature requirement; changing it needs a new reviewed agreement version, not a button bypass.
- Keep client acceptance, investor signatures and any required fund acceptance signature. Combine internal review with the authorized acceptance/signing action where possible, rather than asking the same person to approve and then approve again.
- ROAS's MSA signed October 28 remains the working reference. Do not fabricate a Harmonious signature, mark it retroactively executed or amend that signed copy.
- Preserve already-sent signature requests and all signed copies. Apply changed signing policies prospectively to new versions.

## Safeguards that stay
The blanket removal will not disable money-path segregation, bank/wire release checks, tax-filing controls, identity/AML/accreditation review, MFA, access escalation or self-granted signing authority. Existing reasoned Super Admin exceptions remain where already supported. No automated payments, filings beyond the existing approved IRS exception, investor admission or AI publication.

## Screens
- Keep one clear Approve action for each routine decision, with current draft/version and outcome visible.
- Remove second-reviewer prompts only on covered workflows; protected checks remain clearly labeled.
- Distinguish **Approved**, **Client signed**, **Awaiting required signature** and **Executed** so approval never claims a signature occurred.
- Keep the fund Approvals page as the shared location; reuse existing review tools rather than create a new queue.

## Technical implementation
- Introduce an explicit, deny-by-default approval policy for named routine actions, using existing server authorization. Do not change shared `selfApprove` or `canApprove` globally without separating protected callers.
- Update canonical services, matching database enforcement, UI eligibility, notifications and tests together for each covered action family.
- Update commercial and fund signing models with version-bound signature requirements; keep provider-completion evidence authoritative.
- Reuse existing append-only events and atomic version replacement transactions; no bulk live approvals or historical backfill.
- Update project rules so the new routine policy supersedes older two-person requirements without changing protected rules.

## Verification and release
- Add concrete tests for authorized preparer approval, unauthorized refusal, protected-path maker-checker retention, required-signature retention, immutable history and duplicate-click safety.
- Test desktop and phone review flows with fictional records.
- Full authenticated save, approval, signing and read-back require independently isolated QA with synthetic actors. Do not use production agreements or investors for testing.
- Report which action families are updated and which signature requirements remain contractually necessary. Publishing and any approval of actual pending items are separate actions.