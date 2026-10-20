## Out of scope
The other findings from the investigation are not part of this change. Those are signer names, the two-signer path, version locking and archive folders.

## Calvin
After this ships, Calvin can press Try again himself, or staff can press Retry. I won't send anything for him.

## Technical details
- `box.server.ts` `uploadFile`: add a per-send suffix (timestamp plus a short random part) to the file name so Box never hits a name conflict and versions an older file. In the conflict fallback, use the same Word/PDF content type as the first upload.
- `mapSignStatus`: map `error*` to a new `failed` state instead of `cancelled`. Callers that compare to `cancelled` keep their current behavior for real cancellations. A new `failed` value fits the existing `provider_status` text column, so no database change is needed. Check for any enum or constraint first. If one exists, add the value with a small additive change that applies when the draft is accepted.
- Retry function `retrySigningRequest(documentId, scope)`: server-checked. The caller must be the investor on that investment or Harmonious staff, and the current status must be `failed`. It refuses after 3 retries in 24 hours, counted from `signature_audit_events`. It records a `box_sign_retry` event and reuses the existing send path. There is no new send engine.
- UI: `document-sign-card.tsx` shows a failed message with Try again. `ops-signature-requests.tsx` shows Failed with Retry.
- Tests:
  - an `error_converting` status maps to failed
  - Retry is refused unless the status is failed
  - Retry is refused after 3 tries
  - two sends give two different file names
