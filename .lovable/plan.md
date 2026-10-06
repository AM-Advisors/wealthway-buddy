# Fund launch flow: Drive migration to real, subscribed investors

## What the team will see
A new **Investors** step (step 4) on the fund migration page, which runs alongside Fund Setup:

1. **Accept AI-suggested investors before launch.** Accepting a suggestion now creates a real investor record (person, investing profile, investment) even while the fund is still in setup. Today this fails with "fund not open for onboarding". Nothing is sent to the investor.
2. **Mark existing investors as "Already subscribed off-platform".** For investors who signed and funded before Harmonious, staff enter or confirm:
   - the commitment and funded amount, which the AI pre-fills from the subscription document;
   - the date signed;
   - the source documents (the executed subscription agreement and any wire proof from the Drive files).

   A **second staff member must confirm** it (maker-checker). Until then it shows as "Prior subscription: awaiting confirmation".
3. **Fund launch checklist.** The page shows what still blocks launch: the normal Fund Setup approval, required documents and bank account. It links to the existing launch approval. Launching stays a separate, existing step.
4. **Send invites (manual).** Once the fund is launched, staff select investors and click **Send invites**. Each investor gets the normal invite email and signs in. Every investor still completes **About You and Verification (KYC)**. Investors with a confirmed prior subscription skip **Sign and Fund**. Their executed documents and funded amount show in the portal and in My Share. Everyone else goes through the full About You, Verification, Sign and Fund steps.
5. **Progress per investor:** Suggested, Record created, Prior subscription confirmed, Invited, Joined, KYC done, Subscribed.

## Safety rules kept
- A confirmed prior subscription is shown as **"Funded (prior, off-platform)"**. It is never counted as money Harmonious reconciled. It never moves money and never creates bank or ledger entries. Bank-reconciled funding stays the only source of "Funded" for money handled on the platform.
- Prior subscriptions are append-only. Corrections add a new version with a reason.
- Only Super Admins and Operations leads can accept, mark or confirm. Leadership stays view-only. The person who records a prior subscription can't confirm it.
- KYC is never skipped.

## Technical details
- Add an `allowPreLaunch` path to `createInvestor` (investor-record.server.ts), used only by `drive-migration.server.ts` `decideSuggestion`. It skips `launchedOffering` and requires Harmonious staff (`requireManager`).
- New append-only tables, with GRANTs and RLS, readable through service-role server functions only:
  - `prior_subscriptions` (onboarding_id, commitment_cents, funded_cents, signed_on, evidence_item_ids, recorded_by, version, reason)
  - `prior_subscription_decisions` (confirm/reject, by, at, note; the DB trigger rejects confirmations by the recorder)
- `funding-status.ts`: add a separate `prior_offplatform` state ("Funded (prior, off-platform)"). Reconciled totals keep excluding it. A separate prior-funded total feeds My Share and capital account views.
- `investment-readiness.ts`: a confirmed prior subscription satisfies the Sign and Fund requirements, labelled as prior. KYC requirements stay unchanged.
- New migration step UI in `/ops/fund-migrate/$fundId` and a bulk **Send invites** that calls the existing `inviteInvestor`, enabled only after launch.
- Record the new rules in src/lib/AGENTS.md.
