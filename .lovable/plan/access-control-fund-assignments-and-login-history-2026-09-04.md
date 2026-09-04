# Access control, fund assignments, and login history

Three additions to the admin console: a retained record of every sign-in attempt, a place to assign people to funds, and a fund-manager view limited to the funds a manager is assigned to.

## 1. Login attempt history

A new record is written on every sign-in attempt from the sign-in page — successful or failed — capturing the email tried, the result, the failure reason, the time, the IP address and the browser. Records are retained indefinitely and are only readable by admins.

New admin page **Security > Login activity**:
- Newest-first table: time, email, result badge, reason, IP, browser.
- Filters: all / successes only / failures only, plus an email search box.
- A small summary strip: failed attempts in the last 24 hours, and emails with 3+ recent failures highlighted.

## 2. Assigning people to funds

New admin page **Access**, with two tabs:

- **Fund managers** — pick a person and the funds they manage. A manager sees only applications for those funds.
- **Investors** — grant a person access to specific funds. Investors only see and can apply to funds granted to them (this is what keeps 506(b) offerings private).

Each tab lists current assignments with a remove control, and shows the fund name plus the person's email. Assignments are recorded with who granted them and when.

Existing behaviour is preserved: if no investor has been granted any funds yet, nothing changes for open 506(c) offerings — the grant list is applied to 506(b) funds only, and to 506(c) funds only once you start granting.

## 3. Fund manager experience

A person with the fund-manager role gets the same review console as an admin — queue, application detail, notes, emails, approvals — but every list and every record is filtered to their assigned funds. They cannot reach the Access page, the login activity page, or applications for other funds. Admins continue to see everything.

The top navigation shows an "Admin" link for admins and a "Funds" link for managers.

## Technical notes

- Migration:
  - Add `fund_manager` to the `app_role` enum.
  - `login_attempts` (email, user_id nullable, success bool, failure_reason, ip, user_agent, created_at) — insert via a public server route (unauthenticated sign-in failures have no session), select restricted to admins.
  - `fund_managers` (user_id, offering_id, granted_by, created_at, unique pair) and `investor_fund_access` (user_id, offering_id, granted_by, created_at, unique pair). GRANTs for `authenticated` + `service_role`; RLS: admins manage all, managers/investors read their own rows.
  - `private.manages_offering(_offering_id uuid)` and `private.can_review_application(_app_id uuid)` security-definer helpers (mirroring the existing `private.has_role` / `private.owns_application` pattern, executable by `authenticated` + `service_role` only).
  - Extend existing admin RLS policies on `investor_applications`, `admin_notes`, `investor_emails`, `payments`, `accreditation_records`, `kyc_verifications`, `aml_screenings`, `document_signatures`, `subscriptions` so `private.can_review_application(...)` also grants review access.
  - Offerings visibility: 506(b) offerings readable only by admins, their managers, and investors with a grant.
- Record login attempts from `src/routes/auth.tsx` via a new server route `src/routes/api/public/login-attempt.ts` (rate-limited, validates input with Zod, records IP from request headers, never echoes credentials).
- `getAdminAccess` in `src/lib/admin.functions.ts` returns `{ isAdmin, isFundManager, offeringIds }`; the review server functions scope their queries by that result instead of an admin-only check.
- New server functions in `src/lib/access.functions.ts`: `listUsers`, `listAssignments`, `assignFundManager`, `revokeFundManager`, `grantInvestorFund`, `revokeInvestorFund`, `listLoginAttempts` — all under `requireSupabaseAuth`, admin-only, with the caller's role verified through `context.supabase` before any privileged work.
- New routes: `src/routes/_authenticated/admin.access.tsx`, `src/routes/_authenticated/admin.security.tsx`, each with its own `head()` metadata.
