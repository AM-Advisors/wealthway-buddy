# Real share records, certificates and holder access

Today the cap table page saves shareholders, shares and transfers into the database, but
there is nothing that turns a share record into an actual certificate, and shareholders
themselves have no way in. This adds both, and tightens the recording flow.

## 1. Recording shares and transfers (make the existing flow solid)

- Every share record keeps an automatic, unique certificate number per company
  (e.g. CS-0001 for common, PS-0001 for preferred), instead of relying on typed entry.
- Share quantities are validated: a transfer can never move more than the holder actually
  holds, and approving a transfer splits the original record and creates a new record for
  the recipient, with both linked to the transfer.
- A transfer that is approved cancels the source certificate and issues a replacement
  certificate to each side, so the paper record always matches the numbers.
- Full history stays on the audit trail: who recorded it, who approved it, when.

## 2. Certificates

- Each share record gets a certificate that we generate: company name, holder name,
  security type and class, quantity, price, issue date, certificate number, and a
  verification code.
- A certificate starts as a draft. An authorised person on the client's account
  (GP, signatory, legal or finance) signs it by typing their legal name; only then is it
  marked issued, with signer name, title, date, and the device details recorded.
- Founders can also upload their own signed certificate file, either instead of the
  generated one or as a replacement copy. Files are stored privately and only reachable
  by that company's people, the holder it belongs to, and Harmonious staff.
- Cancelled or replaced certificates stay on record, marked cancelled, never deleted.
- Download and print from the cap table page; holders can download their own.

## 3. Shareholder credentials

Two ways in, both offered:

- **Invite by email** — the founder invites a shareholder; they receive a branded
  Harmonious email with a one-time link to set a password, and then sign in to a
  shareholder view showing only their own holdings, certificates and transfer history.
- **Private view link** — for holders who don't want an account, a single-use-issued
  secret link that opens a read-only view of their own holdings and certificates.
  Links can be expired or reissued by the founder at any time, and every open is logged.

Shareholders can never edit anything, see other holders, or see company totals beyond
their own ownership percentage.

## 4. Staff view

The existing plan usage page gains certificate counts: issued, draft awaiting signature,
and how many shareholders have active access, so stalled sign-offs are visible.

## Technical notes

- New tables (client-scoped, RLS on, GRANTs to authenticated/service_role):
  - `cap_certificates` — holding_id, client_id, stakeholder_id, certificate_no, status
    (draft/issued/cancelled/replaced), generated payload, storage path for uploaded file,
    signer name/title/typed name, signed_at, signature IP/user agent, verification_code,
    replaced_by.
  - `cap_holder_access` — client_id, stakeholder_id, kind (login/link), invited email,
    linked user_id, token hash, expires_at, revoked_at, last_seen_at, access log counters.
  - `cap_holdings` gains `parent_holding_id` and `transfer_id` so split records trace back.
- Private storage bucket `cap-certificates`, policies scoped by client membership,
  holder-owned certificate, or staff role; reads via short-lived signed URLs.
- Server functions in `src/lib/founder-cap-table.functions.ts` plus a new
  `cap-certificates.functions.ts`: issue, sign, upload, cancel, regenerate, invite holder,
  issue/revoke link, holder-scoped read.
- Certificate number allocation inside a single statement scoped per client and class to
  avoid duplicates; unique index on (client_id, certificate_no).
- Holder link route is public (`/shares/$token`) and reads through a security-definer
  function that validates the token hash, expiry and revocation; holder logins live under
  the existing authenticated shell with a shareholder-only role.
- Certificate rendering reuses the branded document approach already used for invoices
  and capital account statements.
