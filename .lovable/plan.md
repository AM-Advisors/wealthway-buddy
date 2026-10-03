# Rename Administration to Leadership and add a Leadership role

## What changes for you

**1. Sidebar: "Administration" becomes "Leadership"**, a collapsible section with the screens grouped as their own entries instead of one "Administration" page with a long list:

```text
Leadership
  Leadership dashboard
  People
    All users / Test & Demo users / Employees & activity
  Access
    Invites & access / Roles / Legacy permission settings
  Oversight
    Audit log / Activity log / Timeline / Compliance & Controls
  Platform
    Client setup options / Security / Email preview / Email delivery / Webhook log / System status
```

- The Team section keeps only Employees & activity, Mailboxes and Mail for everyone. The management pages move under Leadership.
- "Account management" and "Operations team" are dropped from this list because they already live in Account Management and Team.
- The old Administration overview page still works and redirects to the Leadership dashboard, so no bookmarks break.

**2. New "Leadership" access role: see everything, change nothing**
- Opens every dashboard, the Leadership section, people lists, activity, audit history and the Operations, Sales, Account Management, Marketing and Finance screens, all read-only.
- Can't approve, edit, revoke, archive, invite, send, assign roles or mark test/demo. Those buttons are hidden, and the server refuses them anyway.
- Assigned on the Roles page by Super Admin or CEO. Like other privileged roles, it needs the account classified as an Individual.

## Technical details

- Migration: add `leadership` to the `app_role` enum on its own (enum values must commit before use). Leave existing policies alone; the server-side read paths that already allow `executive` for viewing get `leadership` added only to their read checks.
- `src/lib/staff-role-hierarchy.ts`: add `leadership` to the managed roles with label "Leadership", description "Read-only view of everything" and a rank below CEO, and add it to the privileged-managed set so the Individual classification applies.
- `src/lib/ops-capabilities.ts`: `leadership` gets the `view` capability on all areas and never `execute/approve`. Rename the area title to "Leadership" and keep the id `administration` so existing permission keys don't change.
- Read-only enforcement: a shared `isReadOnlyLeader(roles)` helper (only `leadership`, no write role). Every write server function I touch here (user-access, staff-directory setManager, roles, marketing approvals, sales approvals, invoices) rejects a `leadership`-only caller. Display gating uses the same helper.
- Dashboards: `teamDashboard`, `financeOverview`, `amDashboard`, `getCroDashboard`, the people directory and employee activity accept `leadership` as a viewer with team-wide scope.
- `src/components/ops-sidebar.tsx`: build the Leadership `NavSection` from grouped items with `sub` entries (existing pattern), remove `adminSection`, trim `teamItems`, and include `leadership` in the `leader` display check for view-only links.
- `/ops/areas/administration` redirects to `/ops/dashboards/leadership`.
- Add a rule to AGENTS.md: the Leadership role is view-only and checked server-side.
- Check in the preview: sidebar groups, the Roles page lists Leadership, and a Leadership-only session sees no action buttons.
