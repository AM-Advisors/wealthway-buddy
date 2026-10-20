# Always connect invitations, accounts and investor records

## Today
- Matching by email exists, but it only runs when someone opens an invitation link or starts an investment. Signing up, or simply signing in, doesn't trigger it. Calvin got stuck exactly this way.
- Current gaps in the live data: 1 investment and 4 investor records whose email matches an existing account but aren't connected. There are also 5 waiting invitations for people who already have an account. No record is connected to the wrong account.
- Tax IDs are stored encrypted with only the last four digits readable, so nothing can match on them yet.

## What will happen
1. **Matching on every entry point.** Account creation, every sign-in and every invitation link run the same connection step:
   - waiting invitations for that verified email are accepted;
   - investor records and investments with that email are connected to the account;
   - the account goes straight to its investment.
2. **Matching when records are added.** When a manager or Harmonious adds an investor, or changes an investor's email, and an account with that email already exists, the record and invitation connect to that account right away.
3. **Tax ID recognition.**
   - Every saved tax ID gets a protected match code, so the number itself is never compared or shown.
   - When a new investor record or profile has the same tax ID as an existing one, the platform recognizes it as the same investor. It reuses the existing person and investing profile instead of creating a second one, and shows "Same tax ID as an existing investor".
   - **Safeguard:** a tax ID match on its own never gives someone sign-in access to another account's investments. If the email also matches the verified account, the connection is automatic. If not, it becomes a one-click "Confirm same investor" item for Harmonious. Business EINs are shared by owners and signers, so this prevents the wrong person getting access.
4. **One-time catch-up.** Connect the existing gaps above that match by verified email. Report anything that needs review, such as several records with the same email or conflicting accounts. Nothing is deleted. Duplicates stay read-only and linked, as today.
5. **Ongoing check.** A daily background check finds any invitation, account or record still not connected, fixes the safe ones and lists the rest for Harmonious. Operations sees a count of "Unconnected records".

## Never changes
- Matching needs a verified email. Records owned by a different account are never moved, and money, signing and verification results aren't affected. Every connection is recorded in History.

## Technical details
- Make `connectAccount(userId)` the single engine: `claimPreparedRecords`, plus accepting pending invitations, plus the bound-invitation link from `claimOnboardInvitation`. Call it from `getPortalAccess`, `claimOnboardInvitation`, `startOnboarding`, and an auth-signup hook (server function after email verification).
- When records are created or edited (`createInvestor`, `updateInvestorRecord` email change, invitation creation), look up `auth.users` by email and call `connectAccount` for a verified account.
- Add `investment_profiles.tin_fingerprint` (keyed HMAC, the same function as the tax forms) with an index, set in `store_profile_tax_id` callers, and backfill from the encrypted values. Person resolution and profile reuse check the fingerprint. Account-link suggestions use `reason: "same_tax_id"`.
- Daily job route under `/api/public/hooks` with the existing internal-job auth, plus an Operations count.
- Tests cover: verified email links; an unverified email doesn't; a tax-ID-only match creates a review item, not access; a record owned by another account is never moved.
