# Cleaner sign-in and a role-aware sidebar

Two changes: rebuild the sign-in experience as separate, branded pages with password reset, and replace the thin top bar behind login with a proper sidebar that adapts to who is signed in.

## Sign-in

Today one page toggles between "sign in" and "register", there is no way to recover a forgotten password, and Google sits below the email form.

New structure:

- **`/auth` — Sign in.** Two-panel layout: Harmonious mark, a short line about what the portal is for and a security reassurance on the left; the form on the right. "Continue with Google" comes first, then a divider, then email and password. Links to "Forgot your password?" and "Have an invitation? Create your account".
- **`/auth/register` — Create account.** Same two-panel shell, wording aimed at invited investors ("Use the email address your invitation was sent to"). Explains that a confirmation email arrives before they can continue, and shows a "check your email" state after signing up instead of pretending they are logged in.
- **`/auth/forgot` — Reset link.** Email field, sends a reset link, then shows a confirmation state.
- **`/reset-password` — Set a new password.** Public page the reset link lands on; sets the new password and sends them to their dashboard.

Where people land after signing in is decided in one shared place instead of being duplicated: admins and fund managers go to their console, returning investors to their dashboard, brand-new accounts to the first onboarding step. Failed and successful sign-ins keep being recorded as they are today.

## Sidebar

The top bar behind login is replaced by a collapsible sidebar shown to everyone signed in, with only the items each person's role allows. It collapses to an icon strip (and to a slide-over on phones), and the current page is highlighted.

```text
Harmonious
──────────────
YOUR APPLICATION
  Dashboard
  Documents
  Due diligence
  Portal

ONBOARDING              (investors with an application in progress)
  1 Identity        done
  2 Screening       done
  3 Accreditation   current
  4 Documents
  5 Funding

FUND MANAGEMENT         (fund managers and admins)
  My funds
  Investor review

ADMINISTRATION          (admins)
  Applications
  New application
  Fund access
  Fund setup
  Onboarding funnel
  Email preview
  Security
──────────────
signed-in email
Sign out
```

The onboarding group shows each step with a tick, a "current" marker or a plain dot, so investors always know where they are. It only appears while an application is unfinished. Page-level "Back to admin" style links stay, so nothing breaks, but the sidebar becomes the main way to move around.

## Technical notes

- New routes: `src/routes/auth.index.tsx` (sign in), `auth.register.tsx`, `auth.forgot.tsx`, `reset-password.tsx`. `src/routes/auth.tsx` becomes a thin pathless-style layout holding the shared two-panel shell and rendering `<Outlet />`; existing `/auth` links keep working. Each page keeps its own `head()` metadata.
- Google keeps using `lovable.auth.signInWithOAuth` with `redirect_uri: window.location.origin`; the intended destination is stored separately and applied once a session exists.
- Password reset uses `supabase.auth.resetPasswordForEmail` with `redirectTo: ${origin}/reset-password`, and `/reset-password` calls `updateUser({ password })` — no current password on the recovery page.
- Post-sign-in routing moves into a small shared helper used by both the sign-in page and the OAuth return path.
- Sidebar: new `src/components/app-sidebar.tsx` built on the existing shadcn `sidebar` primitives, plus a `SidebarProvider` + `SidebarTrigger` shell inside `src/routes/_authenticated/route.tsx`. The auth gate in that file (`ssr: false`, `beforeLoad` redirect to `/auth`) is left exactly as it is; only the chrome around `<Outlet />` changes.
- Role visibility reuses the existing `getAdminAccess` query (`isAdmin` / `isReviewer`); onboarding progress reuses the investor application status already fetched for the dashboard, exposed through a small server function so the sidebar does not duplicate queries.
- Sign-out keeps the existing order: cancel queries, clear cache, sign out, replace-navigate to `/auth`.
- Widths use `w-[var(--sidebar-width)]` syntax, and the provider wrapper keeps `w-full`.

No database changes, and no change to onboarding, diligence, funding or admin logic.
