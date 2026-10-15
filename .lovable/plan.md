# Add a Resend button on the SS-4 signature request

## What we're building
On the fund's Formation & EIN screen, each SS-4 signature request that is still waiting for the manager's signature gets a **Resend** button next to Cancel. Clicking it re-sends the same signing email (same personal link) to that manager without creating a new request or changing any of the form data.

## Why it's needed today
The only way to remind a manager who hasn't signed was to prepare and send a fresh SS-4 request, which cancels the previous one and can discard corrections. A resend just nudges the existing request.

## Changes

### 1. Server function (`src/lib/ss4-request.functions.ts`)
Add `resendSs4RequestFn`:
- Input: `requestId` (uuid).
- Authorization: same `requireStaffOrManager` check on the request's fund (staff, or a manager of that exact fund).
- Guards: request must exist and still be `requested` (signed or cancelled requests can't be resent).
- Reads the signer's email from their profile directly (by the stored signer user id), so a resend still works even if their manager grant changed.
- Re-sends the existing "Please review and sign your Form SS-4" email with the same portal link (`/manager/ss4/<requestId>`). No idempotency key is passed, so each resend sends a fresh email instead of being deduped.
- Returns `{ emailed: boolean, signerEmail: string | null }` so the UI can tell staff when the manager has no email on file.
- Best-effort audit entry (`ss4_request_resent`) in the fund's Audit History.

No schema change: the existing immutability guard on `ss4_signature_requests` permits updates only while a request is open, and a resend touches no row — so nothing about the request record changes.

### 2. Staff UI (`src/components/ss4-request.tsx`, `Ss4RequestPanel`)
- In the request list, show a **Resend** button for rows with status `requested` (alongside the existing Cancel).
- Toast on success: "Resent to <email>" or, when the manager has no login email, "No email on file — share the link with them."
- Button disabled while the resend is in flight; the request list refreshes after.

## Not changing
- The manager's signing page, the signed/cancelled request rows, the email template, and any filing behavior (still manual — nothing is sent to the IRS).

## Verification
- Typecheck and build.
- Verify via the running preview: open a fund with an open SS-4 request, click Resend, confirm the toast and that the request row is unchanged (same timestamp, still "Waiting for signature").
