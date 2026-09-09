# Fund manager sign-in and manager admin panel

Give fund managers their own front door — a branded manager sign-in page and a manager-only control panel — so you can invite a real manager and log in as them without going through the investor sign-in.

## What you'll get

**A manager sign-in page at `/manager-login`**

- Harmonious-branded, clearly labelled "Fund manager sign in", separate from the investor sign-in.
- Email + password and Continue with Google, same as the investor page.
- After signing in it always lands on the manager panel. If the account is not a manager or admin, it signs them back out with a clear message ("This sign-in is for fund managers — investors sign in here") and a link to the investor page.
- A "Set or reset your password" link for first-time managers.
- Invitation emails for the fund-manager role point at this page instead of the investor page.

**A manager panel home at `/manager`**

The existing manager pages become one panel with a proper landing screen:

- Header showing who is signed in, their role, and the funds they manage.
- Cards linking to: investor review board, fund operations, fund documents, wire instructions, invitations (invite other managers and investors), fund pages, due diligence rooms, and the activity log.
- At-a-glance counts per fund: applications in review, documents awaiting signature, wire confirmations awaiting approval, open issue flags.
- Everything stays scoped to assigned funds; admins see all funds and keep their existing `/admin` area unchanged.

**Walkthrough after building**

Invite a real fund manager from the Access page to a chosen fund, confirm the invitation email arrives with the manager sign-in link, then sign in as that manager and confirm the panel shows only their fund.

## Technical approach

- New public route `src/routes/manager-login.tsx` (top-level, SSR, no auth gate) reusing the sign-in logic in `src/routes/auth.index.tsx`: `signInWithPassword`, `lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin })`, and the existing `/api/public/login-attempt` logging.
- New helper in `src/lib/post-signin.ts`: `managerDestination(userId)` reads `user_roles`; returns `/manager` for `fund_manager`, `/admin` for `admin`, otherwise `null` so the page can sign the account out and show the investor link.
- `destinationAfterSignIn` unchanged, so the existing investor page keeps working.
- New server function `getManagerPanelSummary` in `src/lib/manager.functions.ts` (auth middleware, reviewer-scoped) returning, per assigned fund: applications by stage, unsigned document count, pending wire confirmations, open flags. Admins get all funds.
- Rework `src/routes/_authenticated/manager.index.tsx` into a panel landing page with the summary cards and links; move the current investor roster into the existing review board section or a `/manager/investors` tab so no functionality is lost.
- `src/lib/email-templates/fund-invitation.tsx` and `src/lib/invitations.functions.ts`: when the invited role is `fund_manager`, the sign-in URL in the email is `/manager-login` (password link still goes to `/reset-password`).
- Sidebar: manager group links to the panel and its pages; add a "Manager sign-in" link on the investor sign-in page footer for discoverability.

Permissions are unchanged — this is a separate door into the same fund-scoped access that already exists, not a new permission model.

## Note on the previous plan

The manager activity log approved a moment ago has not been built yet. I'll build this manager sign-in and panel first, then the activity log, and the panel will link to it.
