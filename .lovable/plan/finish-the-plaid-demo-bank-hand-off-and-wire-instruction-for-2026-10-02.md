# Finish the Plaid demo bank hand-off and wire-instruction form

## Goal
On the walkthrough fund's Banking tab, a fund manager links a Plaid sandbox bank account and it stays saved. The tab then shows a wire-instruction form filled in from that account, which the manager checks, completes, and saves.

## Current state (checked)
- No fund has a saved bank account yet (0 rows), the walkthrough fund included.
- The bank sign-in is set up without an OAuth return address. Banks like First Platypus send the user through an OAuth step, which is where the last attempt stopped.
- Saving the bank only allows admins or people listed as fund managers. Team members with Banking permission are not allowed.
- Saving writes the bank link and the account record in two separate steps.
- Wire-instruction functions already exist (`save_wire_instructions`, `get_wire_instructions`, encrypted storage). Today they only appear on the separate fund banking/admin screens.

## Steps
1. **Reproduce first.** Sign in as the test manager and run the sandbox sign-in twice: once with a non-OAuth bank (user_good / pass_good) and once with First Platypus. Check the server logs to see which step fails. Any further fixes depend on what this shows.
2. **OAuth return.** Add a public return page (`/plaid-oauth`) and pass it as the redirect URI on the link token. The page resumes the Plaid sign-in using the stored link token and then sends the user back to the fund's Banking tab. The return URL must also be added to the Plaid dashboard's allowed redirect URIs. That is a one-time step you'll need to do (I'll give you the exact URL).
3. **Who can connect.** Replace the current access check with the existing fund permission check. Admins, fund managers, and Team members with Banking permission can connect; nobody else can.
4. **Save in one step.** Combine the bank link and account record into one save (database function, service role), so nothing is left half-saved. Store all sandbox accounts, not just the first. The manager picks the account the fund uses.
5. **Wire-instruction form on the Banking tab.** Once an account is connected, show a form filled in with:
   - bank name
   - account name
   - the account and routing numbers from Plaid's Auth product (sandbox returns test numbers)

   The manager adds the beneficiary address, bank address, SWIFT code (optional), and reference/memo. On save, it goes through the existing `save_wire_instructions` with an audit event. The full account number is shown only to the person entering it; after saving, only the last four digits are shown.
6. **Verify in the preview:** connect the First Platypus sandbox bank, refresh, and confirm the account is still there. Save the wire form and confirm it reloads masked.

## Boundaries
- Bank access is read-only. No transfers, payments, or wire sending.
- Sandbox only for the walkthrough. Live Plaid stays unchanged until you approve it.
- Investors see wire instructions only through the existing approved path. Nothing new is shown to them.

## Technical details
- `createLinkToken` adds `redirect_uri` and the `auth` product (needed for account/routing numbers via `/auth/get`).
- A new server function, `prefillWireFromBank(fundId, accountId)`, decrypts the access token server-side, calls `/auth/get`, and returns the numbers only to an authorized caller. Nothing is persisted until the manager saves.
- New migration: a `save_bank_connection` RPC (security definer, service_role only) that upserts the bank link and bank_accounts rows in one transaction.
