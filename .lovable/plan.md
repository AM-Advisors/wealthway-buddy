# Fund manager sign-in and manager panel home

A separate, branded front door for fund managers plus a proper landing screen for their panel, so you can invite a real manager and log in as them.

## Manager sign-in page

- New page at `/manager-login`, clearly labelled "Fund manager sign in" and visually distinct from the investor sign-in.
- Email + password and Continue with Google, plus a "Set or reset your password" link for first-time managers.
- On success it always lands on the manager panel. Admins land on the admin area.
- If the account is not a manager or admin, it signs them straight back out with a clear message and a link to the investor sign-in — no half-open session.
- Fund-manager invitation emails point at this page; investor invitations keep pointing at the investor page.
- A small "Fund manager? Sign in here" link at the bottom of the investor sign-in page.

## Manager panel home

`/manager` becomes a landing screen for managers (and admins viewing manager tools):

- Header with who's signed in, their role, and the funds they manage.
- Per-fund summary cards: applications in review, documents awaiting signature, wire confirmations awaiting approval, open issue flags.
- Quick links to the tools that already exist: investor review, fund operations, fund documents, wire instructions, invitations, fund pages, due diligence rooms.
- The current investor roster and review board move to `/manager/investors` so nothing is lost, and the panel links to it.
- Everything stays scoped to assigned funds; admins see all funds and `/admin` is untouched.

## Then: invite and log in as a real manager

After building, invite a fund manager from the Access page to a fund, confirm the email arrives with the manager sign-in link, and sign in as that manager to confirm the panel shows only their fund.

## Technical approach

- New public route `src/routes/manager-login.tsx` (top level, SSR, no auth gate), reusing the sign-in logic from `src/routes/auth.index.tsx`: `signInWithPassword`, `lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin })`, and `/api/public/login-attempt` logging.
- `src/lib/post-signin.ts` gains `managerDestination(userId)`: reads `user_roles`, returns `/manager` for `fund_manager`, `/admin` for `admin`, `null` otherwise (page then calls `supabase.auth.signOut()` and shows the investor link). `destinationAfterSignIn` is unchanged.
- New `getManagerPanelSummary` in `src/lib/manager.functions.ts` (auth middleware, reviewer-scoped): per assigned fund, counts of applications by stage, unsigned documents, pending wire confirmations, open flags; admins get all funds.
- `src/routes/_authenticated/manager.index.tsx` becomes the panel home; its existing roster/review UI moves to a new `src/routes/_authenticated/manager.investors.tsx` with the same server functions and no behaviour change.
- `src/lib/invitations.functions.ts` / `src/lib/email-templates/fund-invitation.tsx`: sign-in URL is `/manager-login` when the invited role is `fund_manager`; the set-password link still goes to `/reset-password`.
- Sidebar: manager group gains "Investors" alongside the existing entries.

Permissions are unchanged — this is a second door into the same fund-scoped access.

## Note

The manager activity log approved earlier has not been built yet; I'll build it after this, and the panel will link to it.
