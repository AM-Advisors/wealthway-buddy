# Real welcome emails for new client sign-ups

Today, inviting someone on a client's team only records the invitation in the system. No email
goes out, so the person never learns they have access. Fund invitations already do this properly:
they create the account, generate a one-time link where the person chooses their own password,
and send a branded email. This brings client invitations up to the same standard.

## What changes

When an administrator invites a contact from Onboarding:

1. Their account is created straight away (or reused if they already have one).
2. They are attached to the client with the role and approval rights chosen.
3. A one-time secure link is generated where they set their own password.
4. A branded Harmonious welcome email is sent with: who invited them, the client they now act for,
   their role, the note written for them, a "Set your password" button, and what to do first
   (sign the privacy, pricing and migration documents, then their portal).
5. The invitation is recorded as sent, and the audit trail notes whether the email went out.

Passwords are never written into an email. The link expires and only works once — that is both
safer and what regulated clients expect. The person lands on the existing password page and then
their portal.

If the invite email cannot be sent (for example, the address previously bounced), the invitation
is still created, the screen says so plainly, and the administrator can copy a sign-in link
instead.

## Screen updates

- Onboarding contact list shows "Welcome email sent" with the date, or "Not delivered".
- A "Resend welcome email" action on pending invitations, generating a fresh password link.
- Cancelling an invitation stays as it is.

## Technical details

- New template `src/lib/email-templates/client-invitation.tsx` registered in
  `src/lib/email-templates/registry.ts`, styled with the existing Harmonious palette
  (navy #142647, teal #5DC6D1, Rubik/Poppins) and matching `investor-invitation.tsx` structure.
- `inviteClientContact` in `src/lib/client-onboarding.functions.ts` reuses the proven
  `ensureAccount` + `setPasswordLink` (recovery link to `/reset-password`) pattern from
  `src/lib/invitations.functions.ts`; extract both into a small shared server helper rather than
  duplicating them.
- Send through `sendTemplateEmail` with an idempotency key of `client-invite-<invitationId>` so
  retries do not double-send; treat `{ sent: false, reason: 'recipient_suppressed' }` as a
  non-error outcome surfaced in the UI.
- Migration: add `invite_sent_at` and `invite_status` to `client_invitations`; existing rows keep
  a null value meaning "no email sent".
- New `resendClientInvitation` server function under the same contract-authority guard as
  `inviteClientContact`, writing an audit event.
