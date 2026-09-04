# Send a test email from the composer

Add an admin-only way to send the current draft to any address you type, so you can check how the branded email looks before it reaches an investor.

## What you'll see

In the email composer on an application page, next to "Send email":

- A "Send to a test address" field (pre-filled with your own signed-in email).
- A "Send test" button beside it.

Pressing it sends the exact same branded email — same layout, colours, and footer — to that address, with "[TEST]" in front of the subject so it's never mistaken for a real notice. If the subject or message is empty, the button stays disabled just like the real send.

Test sends are clearly separated from real ones:

- They are not logged against the investor's email history and never touch the investor's own address.
- Only admins can use it; the recipient address is validated as a real email and the button is rate-limited to one send every 15 seconds per admin.

## Technical details

- New server function `sendTestEmail` in `src/lib/admin.functions.ts`: `.middleware([requireSupabaseAuth])`, `assertAdmin`, Zod input `{ to: email (max 255), subject: 2–200 chars, body: 2–5000 chars, applicationId: uuid optional }`.
- It reuses the existing `investor-message` template through `sendTemplateEmail`, with `templateData` = `{ investorName: "Test recipient", subject: "[TEST] " + subject, body, offeringName }` (offering name looked up when an application id is passed, else "Harmonious"), and `idempotencyKey` = `test-email-${userId}-${Date.now()}`.
- It writes no `investor_emails` row. It returns `{ ok, message }` mirroring `sendInvestorEmail`, including the `recipient_suppressed` case surfaced as a warning toast.
- `src/routes/_authenticated/admin.$applicationId.tsx`: add `testTo` state seeded from the signed-in user's email (`supabase.auth.getUser()` in an effect, editable), a `testMutation` using `useServerFn(sendTestEmail)`, and the input plus button in the composer's action row. Toast success/warn/error as the existing send does.
