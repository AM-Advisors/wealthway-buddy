# Mercury account opening for funds

## What the client sees
When a fund manager picks **Mercury** in the banking step, Harmonious sends the fund's details to Mercury in advance. The manager then gets a **Continue your Mercury application** button. Mercury opens with the business, address, EIN, formation document and owners already filled in. The manager reviews it, adds anything Mercury still needs (such as ID photos) and submits it on Mercury's own site. Harmonious never submits the application for them.

Texas Capital Bank and Customers Bank keep working exactly as they do now: an email to the Harmonious team.

## Flow

```text
Manager picks Mercury
  -> Harmonious checks the fund has: legal name, EIN, formation document, address, at least one owner
     (anything missing is listed, nothing is sent)
  -> Manager confirms "Send my fund's details to Mercury"
  -> Mercury returns a personal sign-up link
  -> Link is saved on the bank request; status "Application started"
  -> Mercury sends status updates back -> status moves to "Submitted", "Approved" or "Needs info"
  -> Operations sees the same status on the Banking page
```

## What gets sent to Mercury
- About: legal business name, description, industry (Investment fund), website if on file
- Formation: EIN, company structure, formation document (Certificate of Formation or Articles), EIN letter if on file. Uses the "pending EIN" application type when the EIN isn't issued yet.
- Addresses: legal and physical address, business phone
- Beneficial owners: from the fund's KYC people (name, email, phone, address, date of birth, citizenship, ownership %, job title such as General Partner)
- Invite email: the manager's email

ID document images and Social Security numbers are **not** sent. The owner enters those directly with Mercury.

## Safety
- Only the fund's managers or Harmonious staff can start it, checked on our servers. One active Mercury application per fund; repeat clicks reuse the same link.
- Every send and status change is recorded permanently.
- No money moves, and no Mercury account is linked or funded by this feature. Connecting the finished account still goes through the existing read-only Plaid bank feed.
- Testing uses Mercury's sandbox until you switch it to live.

## What you need to provide
1. **Mercury partner approval:** Mercury only opens its onboarding service to approved partners. Contact your Mercury account manager (or api@mercury.com) and ask for Onboarding API access and your **partner ID**.
2. **A Mercury API token** from Mercury's settings. I'll ask for it in a secure form, so please don't paste it in chat. A sandbox token works for testing first.

I can build everything now. Until the token is added, the Mercury button falls back to today's email-to-Harmonious request.

## Technical details
- Endpoint: `POST https://api.mercury.com/api/v1/submit-onboarding-data` (sandbox `https://api-sandbox.mercury.com/api/v1/`), `Authorization: Bearer <MERCURY_API_TOKEN>`; body `APISubmitOnboardingDataParams` (`partner`, `beneficialOwners` required; `about`, `applicationType` PendingEINApplication|DefaultApplication, `formationDetails` {federalEin, formationDocumentFileBlob, formationDocumentType, companyStructure}, `businessLegalAddress`, `businessPhysicalAddress`, `businessContactDetails`, `inviteEmail`, `webhookURL`). Response `{ signupLink, onboardingDataId }`.
- Secrets: `MERCURY_API_TOKEN`, `MERCURY_PARTNER_ID`, `MERCURY_ENV` (sandbox|production), and a webhook shared secret if Mercury signs callbacks.
- Migration: add `provider_ref`, `signup_link`, `provider_status`, `submitted_payload_hash` to `offering_bank_setup_requests`; new append-only `bank_application_events` (request_id, status, source, payload summary, created_at) with service-role grants and RLS enabled.
- `src/lib/mercury-onboarding.server.ts`: builds the payload from offerings, entity details/formation documents (storage blobs base64) and KYC people; validates required fields; calls Mercury; never logs PII or the token.
- `src/lib/fund-entity.functions.ts`: `startMercuryApplication` and `mercuryReadiness` server functions (requireSupabaseAuth + assertCanManageFund); `requestBankSetup` unchanged for other banks.
- Webhook: `src/routes/api/public/mercury/onboarding.ts`, verifies the caller before any write, updates status and appends an event.
- UI: Mercury branch in the client banking step (readiness checklist, confirm, Continue button, status badge); status column on `ops.banking.tsx`.
- AGENTS.md rule: Mercury onboarding only pre-fills; the applicant submits on Mercury; no money movement.
