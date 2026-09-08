# Invitation-only funds and three clear roles

Today anyone who signs up is automatically dropped into the first open fund and starts an application. That stops. From now on a person can only see and apply to a fund they were invited to, by an administrator or by a manager of that fund.

## The three roles

- **Administrator** — only accounts with a verified `@harmonious.co` email. Granted automatically the moment such an account is confirmed, and removed automatically if the email isn't on that domain. Full access: create funds, documents, wire details, all investors, all managers.
- **Fund manager** — granted when someone is assigned to a fund. Sees only their own funds and can invite investors and other managers to those funds, and remove them. Cannot create funds or see other funds.
- **Investor** — granted when an invitation is accepted. Sees only the funds they were invited to.

Existing investors keep every fund they already have. Existing administrators whose email is not `@harmonious.co` lose the administrator role (their fund-manager or investor access is untouched).

## Invitations

A new invitation record holds: the email invited, the fund, the role (investor or manager), who invited them, an expiry (14 days), and its state (pending, accepted, revoked, expired).

Sending an invitation does two things at once:

1. Grants access immediately — the account is created if it doesn't exist yet, so the person can simply sign in.
2. Sends a branded Harmonious invitation email with a sign-in link naming the fund.

When the invited person signs in, their verified email is matched against pending invitations and any remaining access is applied, then the invitation is marked accepted.

## What changes on screen

- **Manager portal** — a new "Investors and managers" panel: invite by email, see who's pending versus active on each of their funds, resend, revoke, remove access. Managers only ever see their own funds here.
- **Access page (admin)** — same invitation controls across all funds, plus the pending-invitation list, resend and revoke.
- **Fund setup wizard** — step 3 now sends invitations instead of silently granting access.
- **Investor sign-in with no invitation** — instead of being dropped into onboarding, they see a short "You don't have an invitation yet" page with a contact line, and no application is created.
- **Invited investor** — signs in and lands on the fund they were invited to, ready to start identity verification.

## Technical notes

Database migration:

- `fund_invitations` (email, offering_id, role, token, status, invited_by, expires_at, accepted_at, accepted_by) with grants, RLS: admins full access; fund managers full access limited to funds in `fund_managers`; invited users can read their own invitation by matching their verified email.
- `private.manages_offering(offering_id)` already exists and is reused for manager scoping.
- Trigger on `auth.users` (after insert and after `email_confirmed_at` transitions to non-null): grant `admin` in `user_roles` when the confirmed email's domain is `harmonious.co`; delete a stale `admin` row when it is not. Verified-email check only, so nobody can self-grant by typing an address.
- Same trigger path applies pending invitations for the confirmed email: upsert `investor_fund_access` or `fund_managers` + role row, mark invitation accepted.
- One-off data fix: delete `admin` rows for non-`@harmonious.co` accounts; backfill `investor` role rows for users who already have an application or fund access.

Server functions:

- New `src/lib/invitations.functions.ts`: `listFundInvitations`, `inviteToFund`, `resendInvitation`, `revokeInvitation`, `removeFundAccess` — each authorised by "admin, or manager of this specific fund", not blanket admin.
- `src/lib/access.functions.ts` and `admin-setup.functions.ts` switch their assignment paths to go through the invitation flow so every grant leaves a record.
- `getOnboarding` in `src/lib/onboarding.functions.ts` no longer creates an application against the first open fund; it resolves the invited fund from `investor_fund_access` and returns a "not invited" state when there is none.
- New email template `fund-invitation.tsx` reusing the existing Harmonious layout and click tracking.

UI: new invite panel component shared by `/manager` and `/admin/access`, wired to the same server functions; onboarding "no invitation" screen; wizard step 3 rewired.
