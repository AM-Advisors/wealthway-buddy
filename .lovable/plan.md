# Full verification review inside Harmonious (standard for every investor)

## Goal
Everything the verification service's session page shows — and the Approve / Decline decision — lives on the person's account page in Harmonious, so nobody has to log in to the provider. Tommy's session (5bb14ad7-4efc-4b55-b251-a747b1b92c63) is the first one pulled and is used to check the layout.

## What you'll see on each account page
The Customer identification report gets a full review layout, one card per step, each with a clear Pass / Needs review / Failed / Not done badge:

1. **Summary**: overall result, session ID, workflow, started and finished times, and the warnings the service raised, in plain words.
2. **ID document**: driver's license or passport type, issuing country and state, last four of the document number, issue and expiry dates, name/birth date/address as read from the ID, and each document check (authentic, not expired, MRZ/barcode, data consistent).
3. **Liveness**: pass/fail, score and method.
4. **Face match**: score and the match threshold.
5. **AML / watchlist**: lists screened (sanctions, PEP, adverse media), total hits, and each possible match with name, list, match score, country and birth date, so a reviewer can rule each one out.
6. **Address / proof of address**: the result and the address that was matched.
7. **Phone and email checks**, when the session included them.
8. **Device and IP**: IP address and location, VPN/proxy flag, and device. This is the audit section.
9. **Questionnaire answers** (investor type, accreditation, etc.), shown as question/answer.
10. **Decision history**: provider decision, any Harmonious decision, who made it, when and why.

**Photos** (ID front and back, selfie): shown only through short-lived links fetched when a reviewer clicks "Show images". They are never saved in Harmonious, so the current rule of not storing ID images stays in place.

**Decide in Harmonious**: when a check is In Review, the page shows **Approve**, **Decline** and **Ask to verify again**. A reason is required to decline, to ask for a new check, or to approve while AML has possible matches. Nobody can decide their own check; a Super Admin can, with a logged reason. The decision is saved in Harmonious and sent back to the verification service, so both match. An approved decision then fills in the person's KYC/AML automatically, the same way approved sessions already do.

## Standard for all investors
- Every new and updated session (webhook and the sync job) stores the full review details. That covers account checks and investor verifications.
- A one-time refresh pulls the full details for existing sessions. It is read-only from the provider; nothing is approved or changed.
- The same review appears on the account page and in the identity review queue.

## Technical details
- The provider's session decision is read through the existing `fetchSessionDecision`. A new pure mapper, `src/lib/kyc-review-model.ts`, normalizes it into a stable `review` shape (sections above), with ID numbers masked to the last four and no image URLs. It is stored in a new `review_details jsonb` column on `kyc_verifications` and `account_identity_checks` (additive migration, no RLS changes; staff-only server reads).
- `syncVerification`, the account-check sync and the Didit webhook write `review_details`. A backfill server task (staff-triggered, idempotent) refreshes existing sessions.
- Images: new authorized server function `getVerificationImagesFn` (staff/compliance only, MFA step-up, audit-logged). It re-fetches the decision and returns the provider's temporary URLs without persisting them.
- Decisions: extend `decideAccountCheck` and add the same action for investor `kyc_verifications`. Each pushes the status to the provider's update-status endpoint, records `harmonious_decision` + reason + decider, and runs the existing `didit-auto-apply` on approve. Self-decision stays blocked; Super Admin self-approval needs a reason.
- UI: `src/components/kyc-report.tsx` is rebuilt around `review` sections, and the queue reuses it.
- Unit tests for the mapper are run against a captured, redacted copy of Tommy's session.
