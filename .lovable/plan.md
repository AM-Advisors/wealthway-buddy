# Adding your real people, and a fund manager panel

Two things: make the Access page a reliable way to get real fund managers and investors signed in, and give fund managers their own panel where they can invite other managers and edit their fund's documents.

## 1. Access page: add real people so they can actually log in

Today inviting someone creates their account and grants fund access, but a brand-new account has no password — the email only points them at the sign-in page. That gets fixed, plus two additions you asked for.

- **Set-password link in the invitation email.** Each invite includes a secure, time-limited link that takes the person straight to a "choose your password" screen. After setting it they land on their fund. The email also mentions they can use "Continue with Google" with the same address, so both paths work.
- **Invite to several funds at once.** The fund picker becomes a multi-select; one entry grants access to every fund ticked and sends a single email listing them.
- **Paste a list of emails.** A "Add several people" box where you paste emails (one per line, or `Name <email>` / comma-separated). Everyone gets the same role and funds. After sending you see a per-person result: invited, already had access, or failed with the reason.
- **Resend link** on existing rows sends a fresh set-password link, not just a reminder.

## 2. Fund manager panel

A new **My funds** area for fund managers (admins see it too), scoped strictly to the funds each manager is assigned to.

- **Invite people** — same invite panel as above, limited to their funds. Managers can invite investors *and* other fund managers.
- **Fund documents** — list, add, edit, reorder and remove the documents for their funds, with the existing rule that a document already signed by an investor cannot be deleted. Every change is written to that fund's change history with the manager's name.
- **Fund details stay read-only** for managers: name, exemption type, minimum and target raise remain admin-only. Bank details keep working as they do now (managers can already edit those on the Wire instructions page).

## What does not change

Admin powers, investor onboarding, wire instructions, due diligence rooms, emails and existing access rows all keep working exactly as they do now. Existing invitations and people already added are untouched.

## Technical notes

- **Auth**: use the admin API to generate a `recovery`-type link per invited address, pointed at `/reset-password`; include it in the `fund-invitation` template. Keep `email_confirm: true` on account creation so the auth trigger still syncs roles. Also call the social-auth configure tool for Google if it is not already enabled (it is in use today, so most likely a no-op).
- **`src/lib/invitations.functions.ts`**: change `inviteToFund` input to `offeringIds: string[]`, loop per fund with existing permission checks, and add `inviteManyToFunds` for the pasted list (cap ~50 addresses per submit, validate each, return per-row outcomes). One email per person summarising the funds.
- **`src/components/fund-invitations.tsx`**: multi-fund checkboxes, bulk paste textarea with results table, unchanged permission fallbacks.
- **Fund documents for managers**: new migration adding an `offering_documents` write policy for `fund_managers` on their assigned offering (keep the existing admin policy), and relax `saveOfferingDocument` / `deleteOfferingDocument` from `assertAdmin` to "admin OR manager of that offering". Audit events already record the actor.
- **New route** `src/routes/_authenticated/manager/funds.tsx` (plus sidebar entry visible to managers and admins) hosting `FundInvitations` and a documents editor backed by the existing offering functions.
