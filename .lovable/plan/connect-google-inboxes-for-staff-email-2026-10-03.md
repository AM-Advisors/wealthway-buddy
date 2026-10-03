# Connect Google inboxes for staff email

## Goal

Let each Harmonious employee connect their own Google (Gmail) inbox and send email as themselves, and let the team connect shared group mailboxes (e.g. sales@, ops@) that authorized staff can read and send from.

## Current state

- All outbound email goes through Brevo from the shared `onboarding.harmonious.co` address (`src/lib/email-templates/send-email.ts`); sales outreach emails use the same path (`sendOutreach` in `src/lib/sales-hub.server.ts`).
- The Inbox page is internal in-app messaging only — no Google connection exists anywhere.
- The Gmail per-user connector (`google_mail`) is enabled in the workspace, but no OAuth client is configured yet — that is step 1.

## Plan

### 1. Configure the Google connection (approval card, no code)

- Open the Gmail per-user connector setup card. A workspace admin creates the Google OAuth client (Google Cloud console) and links it to this project.
- The Google OAuth app must list `https://connector-gateway.lovable.dev/api/v1/app-users/oauth2/callback` as an authorized redirect URI, and the client must allow offline access (otherwise no lasting connection is issued and this cannot work).
- Requested Google permissions: read mail, send mail, and modify labels — nothing broader.

### 2. Store each employee's connection safely (migration + server helpers)

- New `app_user_connections` table: one row per employee per service, holding the encrypted connection key. Readable/writable only by server code — never by browsers.
- Encryption helpers (`connectionKeyCrypto.ts`) using the platform-provided `APP_USER_CONNECTION_KEY_SECRET`; keys are stored as ciphertext, never plaintext.
- Save/load/delete helpers keyed by the signed-in user's ID.

### 3. "Connect your Google inbox" for each employee

- A Connect Gmail card on the employee's own page (Employees & activity → their profile, and a prompt on the Inbox). Clicking it opens Google's consent screen; on return the connection is saved against their account.
- Status shown per employee: Connected (with their Gmail address) / Not connected / Reconnect needed. Disconnect removes the stored key.
- Only the employee themselves can connect or disconnect their own inbox; managers can see connection status but never read or send from someone else's mailbox.

### 4. Send as the employee

- Sales outreach email (`sendOutreach`) sends from the rep's connected Gmail when one exists; falls back to the current Brevo sender when not. The sent email appears in the rep's own Gmail Sent folder.
- Replies from contacts land in the rep's real Gmail; a "Recent email" panel on the outreach/contact view lists recent threads with that contact (read-only, fetched on demand — no background syncing or storing of email content).

### 5. Group mailboxes (shared addresses)

- A Team → Group mailboxes section where a leader connects a shared Google account (e.g. ops@harmonious.co) via the standard Gmail connector — one connection per group address.
- Authorized staff (per existing staff roles) can view recent threads and send from the group address; every send records which staff member sent it in the activity log.
- Group mailbox access follows the same server-side role checks as the rest of Operations.

### 6. Housekeeping

- Record the new rules in `src/lib/AGENTS.md`: per-user Gmail via the per-user connector, group mailboxes via the standard connector, connection keys encrypted at rest, email content never persisted.
- Transactional/system email (receipts, invitations, notices) stays on Brevo — unchanged.

## Technical details

- Per-user flow: `connector_app_user--connect_client` for `google_mail`; connect popup + `exchangeAppUserOAuthCode` per the TanStack app-user connector pattern; calls via `callAsAppUser` to `https://connector-gateway.lovable.dev/google_mail/gmail/v1/...` with the user's stored `lovack_*` key.
- Group mailboxes: `standard_connectors--connect` for `google_mail`; server calls with `LOVABLE_API_KEY` + `GOOGLE_MAIL_API_KEY` headers.
- Sending builds an RFC 2822 message, base64url-encoded with MIME-encoded subjects (existing pattern from the Gmail connector docs).
- Auth: all server functions use `requireSupabaseAuth` from `src/lib/require-auth.ts`; per-user calls always keyed to the signed-in user's ID — no shared or placeholder identities.
- Scopes: `gmail.readonly`, `gmail.send`, `gmail.modify` (plus basic profile/email).

## Verification

- Connect a test Google account in the preview, send a sales outreach email, confirm it lands in that account's Sent folder and the recipient receives it from the employee's address.
- Connect a group mailbox, send from it as two different staff members, confirm the activity log names each sender.
- Confirm a non-connected employee still sends via Brevo and sees the "Connect Gmail" prompt.
- Run the sidebar/unit test suite and confirm the build stays green.
