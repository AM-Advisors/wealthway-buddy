# Remove automatic administrator access from @harmonious.co Google accounts

Today, simply signing in with a Harmonious Google account makes someone a full administrator. This plan separates signing in (authentication) from what you are allowed to do (authorization), while keeping Google sign-in working for the team.

## What I found (before changing anything)

Three places grant privileged access automatically from an email domain:

1. `src/lib/admin.functions.ts` — `getAdminAccess()` detects a Google-authenticated `@harmonious.co` account and inserts an `admin` role with the privileged service key.
2. Database trigger function `public.sync_roles_and_invitations()` (runs when a person confirms their email) — inserts `admin` for any `@harmonious.co` address, and deletes `admin` for anyone else. This is the stronger of the two: it grants admin even without Google, and it also silently strips explicitly granted admin from non-Harmonious addresses.
3. Database function `public.list_staff_accounts()` — lists every `@harmonious.co` account as staff even with no roles assigned. Display only, no privilege granted; it becomes the base for the review inventory.

Not automatic promotion, and left alone: invitation-based grants (`staff_invitations`, `client_invitations`, `fund_invitations` in the same trigger and in `portal-access.functions.ts`), fund-manager grants in `admin-setup.functions.ts`, and client-role grants in `client-onboarding.functions.ts` — all require someone with authority to issue an invite first. `set_staff_role()` (explicit, admin-only, audit-logged) stays as the only way to hand out staff roles.

## Changes

**App layer**
- Delete the domain/Google promotion block and the `SUPER_ADMIN_DOMAIN` helper from `src/lib/admin.functions.ts`. `getAdminAccess()` reads roles only; the `supabaseAdmin` import there goes away. Fund-manager scoping and `requireSupabaseAuth` unchanged.

**Database (one forward migration)**
- Replace `public.sync_roles_and_invitations()` with the same body minus the domain branch — both the automatic insert and the automatic delete. Invitation handling is copied across untouched. The trigger itself is not dropped or recreated.
- Replace `public.list_staff_accounts()` so it returns everyone holding a staff role, plus `@harmonious.co` accounts marked clearly as "no access assigned" rather than implied staff.
- Add `public.list_admin_review()` (admin-only, SECURITY DEFINER): every account currently holding `admin` or `super_admin`, with email, name, when the role was created, last sign-in, and whether the account is on the Harmonious domain — so legitimate admins can be confirmed and stale ones removed deliberately.
- No existing admin rows are removed. No RLS policy is touched.

**Review screen**
- Add an "Administrator review" section to `/admin/access` listing the accounts from `list_admin_review()` with a "Last signed in" column and the existing remove-role control, so the cleanup is a human decision with an audit trail.

## Tests

New `src/lib/admin-access.test.ts` (vitest, mocked Supabase context) proving:
- a fresh `@harmonious.co` Google user with no assigned role is not an admin, and no role write happens;
- an explicitly assigned admin is still an admin;
- an investor cannot become an admin;
- a fund manager stays a fund manager with their fund scoping intact;
- Google sign-in still yields an authenticated session and a working non-admin portal;
- client-supplied claims (spoofed email, provider, role) cannot produce a privileged role.

Existing internal-job and Plaid webhook tests must stay green.

## Note

After this ships, any Harmonious employee who was relying on the automatic promotion loses admin until an existing admin grants it on `/admin/access`. I will list the current admin accounts after the migration so you can confirm at least one real administrator remains before anyone is removed.
