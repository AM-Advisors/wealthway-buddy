# One sign-in for everyone

Today there are two separate sign-in pages: one for investors at `/auth` and a second one for fund managers at `/manager-login`. People pick the wrong one, and a manager who signs in on the investor page gets sent to the investor side.

The fix: a single sign-in page. Everyone signs in the same way, and after sign-in the app sends each person to the part of the portal that belongs to them.

## What changes

- **One page.** `/auth` becomes the only sign-in. The wording drops the word "investor" and just welcomes you back; the "Fund manager? Sign in here" link disappears because it is no longer needed.
- **Old link keeps working.** Anyone with `/manager-login` bookmarked, or who clicks it in an older invitation email, lands on `/auth` automatically instead of hitting a dead page.
- **Where you land after signing in** is decided by your role, in one place, for both the email form and Google sign-in:
  - Harmonious admin → the admin console
  - Fund manager → the fund manager panel
  - Investor with an application already started → their dashboard
  - Brand-new invited investor → the first onboarding step
- **Invitation emails** for fund managers point at the same `/auth` address as investor invitations.
- The rest stays as it is: Google sign-in first, then email and password, forgot-password, "Have an invitation? Create your account", and the recording of successful and failed sign-in attempts.

Nothing about what each role can see or do changes — only which door they come through. The sidebar already shows only the sections a person's role allows, so a manager signing in on the shared page sees the manager sections and nothing else.

## Technical notes

- `src/routes/manager-login.tsx` becomes a redirect-only route: `beforeLoad` throws `redirect({ to: "/auth", replace: true })`. Its page body and duplicated Google/password/login-attempt logic are deleted.
- `src/routes/auth.index.tsx` keeps ownership of sign-in. The manager-specific footer link is removed and the copy is made role-neutral; `head()` title/description updated accordingly ("Sign In — Harmonious").
- `destinationAfterSignIn` in `src/lib/post-signin.ts` stays the single routing decision and already covers admin, fund manager, returning investor and new investor. `managerDestination` and the "not a fund manager, sign out" branch are removed with the manager page.
- The password form on `/auth` currently relies on the `useAuth` session effect to redirect; that effect calls `destinationAfterSignIn`, so managers route correctly with no extra work. Google sign-in's inline `destinationAfterSignIn` call stays.
- `src/lib/invitations.functions.ts` line 277: `signInUrl` becomes `${PORTAL_ORIGIN}/auth` for every role.

No database, role or permission changes.
