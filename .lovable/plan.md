# User invitation and account insights

## Goal
Make People & Access the single place to see invitation times, email outcomes, login status, setup gaps, and each user's recorded activity. Show the same relevant status under Clients without creating another user directory.

## What will change
1. **Invitation and email status**
   - Show first successful invite send, latest successful send, who sent it, invitation expiry, acceptance time, and send history.
   - Separate invitation creation from a successful email send. A failed send must not appear as successfully sent.
   - Show clear email outcomes: Sent, Delivered when confirmed, Failed, Bounced, Blocked, or Confirmation unavailable. Include outcome time and a safe explanation of problems.
   - Keep invitation acceptance, email confirmation, and first/last sign-in separate; none proves inbox delivery.
2. **A manageable People & Access list**
   - Add concise summary counts and filters for pending invitations, expired invitations, email problems, never signed in, and incomplete setup.
   - Include latest invite/email status and last sign-in alongside the existing access status and user type.
   - Keep Resend invite and Send password reset close to the relevant person, with sending feedback and logged results. Do not automatically send reminders or retry blocked recipients.
3. **Clickable user details**
   - Expand the existing user activity page with invitation/email history, access and login milestones, and setup progress.
   - Show missing profile details, Didit KYC/AML state, and outstanding onboarding steps from the linked person and investments, where applicable. Staff do not get investor-only requirements.
   - Retain searchable page views, clicks, actions, and access changes; add date filtering and pagination to reach older retained records.
   - Make pending invitations clickable even when no login account exists, using invitation details rather than inventing an account.
4. **Client visibility**
   - Show invite time, latest email outcome, acceptance/login status, and applicable setup gaps beside each client person.
   - Open the shared user or invitation detail view from the client, subject to the same staff permissions.

## Verified findings and delivery limitation
- The directory currently displays invitation dates and last sign-in, but some send dates fall back to record creation dates (`user-access.server.ts`).
- The existing activity page displays account creation, email confirmation, last sign-in, and recorded events; its reads are capped rather than paginated.
- The current template sender uses the existing Brevo connection and returns success without preserving the response message identifier (`email-templates/send-email.ts`).
- The current `/lovable/email/events` receiver handles **Lovable** bounce/complaint/unsubscribe notifications. It is not a Brevo delivery receiver.
- The Lovable sender domain is verified, but managed Lovable email logs do **not** provide delivered/opened confirmation. Therefore those sends must show confirmation unavailable, not a fabricated Delivered badge.
- For existing Brevo sends, verify access to its read-only message event history before implementing positive delivery confirmation. If unavailable, display the limitation explicitly; do not change email providers or credentials.

## Technical approach
- Extend the existing invitation/account read projections and shared UI rather than duplicate users or permissions.
- Preserve send-attempt facts and provider correlation identifiers in existing invitation/access audit structures; no new email queues, dispatchers, suppression stores, or email tables.
- Match email outcomes to the exact send identifier and provider where available, not merely the recipient's latest message. Older uncorrelated sends remain clearly marked as unconfirmed.
- Keep provider reads and all invitation/reset actions server-side, following existing authorization. Scope user insights to authorized staff; do not broaden fund-manager email-log access.
- Batch/paginate reads and load detailed email history on demand so the directory remains fast. Show unavailable/error states rather than misleading empty results.
- Never expose invitation links/tokens, credentials, entered text, tax numbers, bank details, or raw provider payloads in activity history.
- Keep Didit as the verification authority. Do not run KYC, send real invitations, merge people, or change access as part of adding insights.

## Validation
- Test send success/failure, resends, expiry, acceptance, never-signed-in accounts, and exact-message outcome matching, including older outcomes after a newer resend.
- Test delivered versus API-accepted semantics and unavailable email history.
- Verify staff permissions and cross-client restrictions.
- Exercise invitation → send status → acceptance/login → activity and setup details in QA with synthetic sessions only. Do not run browser tests against the shared production backend.
- No publishing or live recipient emails in this task. If QA or provider history is unavailable, report the specific unverified checks.