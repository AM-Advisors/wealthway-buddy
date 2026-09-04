# Fix Didit webhook 401 (signature verification)

Didit's test webhooks are being rejected with 401 `bad_signature` (confirmed in the live logs at 18:40 UTC). Comparing Didit's official reference code with our verifier shows two mismatches, plus one likely configuration issue.

## What changes for you

- Didit test webhooks (and real ones) will be accepted instead of bouncing with 401.
- If a delivery still fails, the logs will show exactly which signature check failed and how the computed value differs, so the next fix is one step instead of guesswork.
- If it turns out the wrong signing key was saved, you'll re-save it once from your Didit console — I'll flag it clearly if so.

## Fixes

1. **Float normalisation (likely root cause).** Didit signs a canonical JSON where whole-valued floats are serialised as integers (`36.0` → `36`). Their reference code does this with a `shortenFloats()` pass before stringifying. Our verifier skips it, so any payload containing a float (the test payload has several, e.g. `face_match_score: 0.94`, `age: 36`) produces a different canonical string and the HMAC never matches. Add the same normalisation to `canonicalJson` in `src/lib/didit.server.ts`, exactly mirroring their reference: recursively, `typeof number && !Number.isInteger(n) && n % 1 === 0 → Math.trunc(n)`.

2. **Simple-signature field order.** Didit's reference builds the simple signature from `{body.timestamp}:{session_id}:{status}:{webhook_type}` using the `timestamp` **field inside the body**. Ours uses the `X-Timestamp` header. The test payload has `created_at` and `timestamp` as numbers; switch to the body field to match.

3. **Diagnostic logging on rejection.** When all three checks fail, log the first 12 characters of each computed digest vs. each provided header. That pinpoints whether it's an encoding mismatch (digests close in structure) or a wrong secret (completely different) — without exposing the secret itself.

4. **Verify with a real Didit "Try Webhook" send.** After publishing, re-send the test from Didit's console (API & Webhooks → Try Webhook). If it's accepted, done. If it still fails and the new logs show a clean-comparison mismatch, the stored webhook secret isn't this destination's `secret_shared_key` — then you copy the key shown for the destination in your Didit console and I update it via the secure secret form.

## Technical details

- All changes are in `src/lib/didit.server.ts` (`verifyDiditWebhook`, `canonicalJson`) and the rejection log line in `src/routes/api/public/webhooks/didit.ts`. No schema, UI, or endpoint-path changes.
- Timestamp window (300 s) and constant-time comparison stay as-is.
- The earlier missing_timestamp 401 in the logs was Didit's console connectivity probe (empty body); that behaviour is correct and stays.
- After the fix, publish so the live endpoint picks it up, then re-test.
