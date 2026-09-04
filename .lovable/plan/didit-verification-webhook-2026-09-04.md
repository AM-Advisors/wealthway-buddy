# Didit verification webhook

Add a secure endpoint that receives live identity, entity, and transaction events from Didit and updates each investor's application automatically, instead of an admin approving checks by hand.

## What changes for you

- When an investor finishes identity verification with Didit, their application moves itself to Approved, Declined, In review, or In progress within seconds.
- Screening (AML) results arrive the same way and update the screening row on the application.
- Every event Didit sends is stored, so the admin page can show a full history and repeated deliveries never double-apply.
- Nothing on the investor wizard or admin screens is removed; admins can still override any decision manually.

## Endpoint behaviour

Path: `/api/webhooks/didit` (POST, public prefix so Didit can reach it).

1. Read the raw request body as text — no JSON parsing before verification.
2. Require `X-Timestamp`; reject if more than 300 seconds from now.
3. Verify `X-Signature-V2` (HMAC-SHA256 over sorted, Unicode-preserved canonical JSON of the parsed body), falling back to `X-Signature` over the exact raw bytes, then `X-Signature-Simple` over `{timestamp}:{session_id}:{status}:{webhook_type}`. Constant-time compare via `timingSafeEqual`; length-checked first.
4. Only after a signature passes, parse the JSON and handle the event.
5. Return 200 quickly. Signature/timestamp failure returns 401 with the raw body logged (truncated) for debugging; unknown event types return 200 so Didit does not retry.

Handled `webhook_type` values: `status.updated`, `data.updated`, `user.status.updated`, `user.data.updated`, `business.status.updated`, `business.data.updated`, `activity.created`, `transaction.created`, `transaction.status.updated`.

## Status mapping

| Didit status | Application |
|---|---|
| Approved | `kyc_status = approved`, decision stored |
| Declined | `kyc_status = declined`, warnings stored |
| In Review | `kyc_status = review` |
| In Progress / Not Started / Resubmitted | `kyc_status = pending` |
| Abandoned / Expired / KYC Expired | `kyc_status = pending`, session marked expired |

An `aml_screenings` row is updated whenever the decision contains `aml_screenings[]`, using its own verdict.

## Technical details

- New route `src/routes/api/public/webhooks/didit.ts` using `createFileRoute` with a `server.handlers.POST`. Verification helpers live in a server-only module (`src/lib/didit.server.ts`): canonical JSON builder, the three signature variants, and the status map.
- Secret read as `process.env['DIDIT_WEBHOOK_SECRET']` inside the handler; requested through the secret prompt.
- Writes use `supabaseAdmin`, imported inside the handler (`await import('@/integrations/supabase/client.server')`), since Didit is unauthenticated.
- Migration adds:
  - `didit_webhook_events` — `event_id` primary key, `webhook_type`, `session_id`, `status`, `payload jsonb`, `received_at`, `processed_at`, `error`. Grants: `service_role` all, `authenticated` select via admin-only RLS policy. Duplicate `event_id` short-circuits with 200 (idempotency).
  - `kyc_verifications`: add `session_id text`, `vendor_data text`, `decision jsonb`, `expired_at timestamptz`; `provider` default stays but Didit rows write `'didit'`.
  - Index on `kyc_verifications(session_id)` and on `investor_applications(id)` lookups already covered by PK.
- Correlation: Didit's `vendor_data` carries the investor `application_id`. If `vendor_data` is absent, the handler falls back to matching `kyc_verifications.session_id`. If neither matches, the event is stored and marked unmatched (still 200), visible to admins.
- Entity, activity, and transaction events (`user.*`, `business.*`, `activity.created`, `transaction.*`) are verified, stored in `didit_webhook_events`, and correlated to an application where possible; no application status derives from them yet.
- Admin detail page gains a small "Verification events" card listing the most recent Didit events for that application, read through an admin server function.

## Out of scope

Creating Didit sessions from the app (the hosted verification link) is not included — this plan only receives events. Say the word and I will add session creation next.
