# Revoke, archive, pending invites, and Test & Demo users

## What you'll get

On every people list (Fund Managers, Founders, Clients, Employees and Investors):

- **Revoke access**: staff choose the scope each time:
  - **Block all sign-in**: the person can't sign in anywhere until they're restored.
  - **Remove from this client/fund only**: they lose access to that one client or fund, and their other access stays.
  - A reason is required.
- **Archive**: hides the person from normal lists and blocks their sign-in. Their history and records are kept. **Restore** brings them back.
- **Status column and filters**: Active, Invited (not joined), Revoked, Archived and Test/Demo.
- **Invited but not joined**: a tab on each list showing open invitations, with who sent each one, when, and the last reminder. Actions are **Resend** and **Cancel invite**. Cancelling records the change; it doesn't delete anything.

A new **People → All users** page under Administration shows everyone in one searchable table: type (Employee, Fund Manager, Founder, Client contact, Investor), status, last sign-in and invite state. It has the same actions.

A new **Test & Demo users** section lets staff click **Mark as test/demo** on any person or client. Marked records:

- move to the Test & Demo section;
- are left out of every dashboard total (Finance, Sales, Account Management, team dashboards) and every investor count;
- can be unmarked at any time.

## Who can do it

Only Super Admin and Operations leads can revoke, archive, restore, cancel invites or mark test/demo users. The server checks this every time. Nobody can revoke or archive their own account. Removing or archiving the last Super Admin is blocked.

## Safety

- Every action is recorded in a permanent history: who did it, when, why, and what it covered.
- Nothing is hard-deleted.
- Investors' signed documents, funding and K-1 records are untouched. Revoking only stops sign-in.
- Blocking sign-in also signs the person out of any open session.

## Technical details

- One new table, `user_access_states`: user_id or person_id, state (active, revoked, archived), scope (global, client, offering), scope_id, reason, actor, timestamps. Changes are logged in a new append-only table, `user_access_events`, protected by a mutation-block trigger.
- New column `is_test_demo` (boolean, default false) on profiles, clients, persons and the invitation tables, with marks logged in `user_access_events`.
- Global revoke/archive uses the auth admin API to ban the user (ban_duration) and end their sessions. Restore lifts the ban. Scoped revoke ends the existing membership rows (`client_users`, fund team, `client_contacts.status`) by setting them to revoked, never deleting them.
- Server-side KYC/portal access checks also refuse users who are globally revoked or archived, as a second check alongside the auth ban.
- Pending invites come from the existing `staff_invitations`, `client_invitations` and `fund_invitations` rows with no `accepted_at`. Cancel sets status to `cancelled`.
- New files: `src/lib/user-access.server.ts` (authorization, ban/unban, scoped revoke, test flag), `user-access.functions.ts`, a shared `<PeopleActions>` / `<StatusFilter>` component used by all five lists, and routes `/ops/people` and `/ops/people/test-demo`. Sidebar entries go under Administration.
- Dashboard queries in `staff-directory.server.ts`, `account-management.server.ts`, the sales hub and the investors table filter out `is_test_demo = true`.
- Add an AGENTS.md rule recording that access revocation lives in `user-access.server.ts` and that test/demo records are excluded from totals.
