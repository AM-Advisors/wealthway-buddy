# Role-based staff sidebar + one People & Access area

## Goal
1. Each employee's sidebar shows only the pages their role(s) can use, governed by one written standard.
2. Access Control, Invites & access, Roles, All users, Test & Demo users and Employees & activity become one **People & Access** area with two groups: **Employees** and **Everyone else** (clients, fund managers, founders, investors).

## The standard (one rule for every menu item)
- Each sidebar entry declares who it is for (roles or capability) in one shared list.
- An entry shows only if the person holds one of those roles; a section disappears when it has no entries left.
- Hiding is display only — every page and action keeps its own server-side check (no access changes).
- New pages must be added to the shared list with their roles, or they don't appear in the menu.

Current gaps this fixes: Team items (Employees & activity, Mailboxes, Mail) show to every staff member; Leadership "Access" mixes in a legacy settings link; Employees & activity appears twice (Team and Leadership → People).

## People & Access (new combined area)
Sidebar: one **People & Access** entry with sub-items:
- **Employees** — directory, last sign-in, manager activity, roles held, invite employee, revoke/archive, role changes.
- **Everyone else** — clients, fund managers, founders, investors: invited-not-joined, revoke/archive/restore, Test & Demo marking (as a filter tab, not a separate page).
- **Roles & permissions** — role definitions and what each role can see (read-only for Leadership viewers; editable for Super Admin/Operations leads as today).
- **Access history** — the existing access audit trail.

Old pages (Invites & access, Roles, All users, Test & Demo, Employees) redirect to the matching tab so saved links keep working.

Who sees it:
- Employees group + Roles: Super Admin, Executive, Leadership, Operations leads.
- Everyone else group: the above plus Operations and Account Managers (their assigned clients only, as enforced today).
- Everyone else in the company: hidden.

## Role-to-section map (initial)
```text
Section              Shown to
Operations           operations, fund_administration, leaders
Finance              finance, tax, fund_administration, leaders
Sales                sales roles (AE, BDR, Sales Manager, CRO), leaders
Account Management   account_manager, client_success, CRO, leaders
Marketing            marketing_manager, marketing_specialist, leaders
People & Access      see above
Leadership           leadership, executive, super_admin
Team: Tasks, Mail    all staff (own items only)
Team: Mailboxes      mailbox managers + leaders
```
"Leaders" = super_admin, executive. A Roles page view will show this map so it can be reviewed.

## Technical details
- New `src/lib/staff-nav.ts`: pure list of nav entries `{ id, title, url, section, roles?, capability? }` + `visibleNav(staffRoles, capabilities)`; `ops-sidebar.tsx` renders from it instead of inline role arrays (SALES_ROLES, AM_ROLES, etc.). Unit test covers each role's menu.
- New route `ops.people-access.tsx` with `tab` search param (`employees | others | roles | history`), composed from existing components (access-control-center, access-admin-panels, employee directory, people list). No new data or permissions.
- Old routes `ops.access-control`, `ops.roles`, `ops.people`, `ops.people_.test-demo`, `ops.employees` become redirects; `ops.employees_.$userId` detail stays.
- Search index ("Find a screen") uses the same `visibleNav` so it only finds allowed pages.
- Record the rule in `src/lib/AGENTS.md`.
