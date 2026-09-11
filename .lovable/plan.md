# Your own admin account in the portal

Set up `info@harmonious.co` as a real, working account with two sides:

1. **Harmonious staff admin** — full access to every client, fund, invoice, approval and sign-off screen.
2. **Client admin for your own company** — a Harmonious company record with its own portal, so you can sign documents and run your own onboarding exactly as a client would.

## What gets created

- A portal account for `info@harmonious.co` under the name **Alyssa Pettit**, with a one-time link to set your own password. No password is ever emailed.
- Google sign-in works on the same address, so you can use either.
- Staff authority: admin plus super admin, so nothing in the console is read-only for you.
- A company record for **Harmonious** with your account attached as its main signing contact, plus approval rights.
- Your account appears on the staff list and on the company's contact list, so it can be managed later like any other.

## What you'll be able to do after this

- Sign in at the portal with your own credentials instead of a shared or test account.
- Sign the privacy, terms, pricing, electronic-record and migration documents from the sign-off page, with your typed name recorded on each.
- Work your own company's portal: fund details, invoices, service requests, payments.
- Approve requests, quotes, wires and agreements from the staff side.

## Notes

- Your existing `alyssa@harmonious.co` account stays as it is; nothing about it changes unless you ask.
- The Harmonious company starts with no statement of work, so fund pages will show the standard out-of-scope message until one is set. I can add a self-administration agreement afterwards if you want the full flow live.

## Technical detail

- Reuse `ensureAccount` / `setPasswordLink` from the existing invite path so the account, welcome email and password link follow the same audited flow as client invitations.
- Grant `admin` and `super_admin` through `set_staff_role`.
- Insert a `clients` row for Harmonious, a `client_users` link with the `client_gp` role and approval rights, plus a `client_invitations` record marked accepted so onboarding tracking stays consistent.
- Confirm sign-in, sign-off and staff console access with a signed-in browser check before reporting done.
