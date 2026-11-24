# Streamline account and access management

Goal: one obvious place, fewer tabs, one clear action per row, for both staff and fund managers. No permission rules change; every action keeps its current server-side checks, reasons and approvals.

## Staff: People & Access

Today: 6 top tabs, plus nested sub-tabs (Everyone else has 4 filters, Invites & access has 6 more), with Roles, People and Invite each appearing twice.

New layout:
- **One search bar at the top** ("Find a person by name or email") across employees, managers, investors, founders and pending invites.
- **Three tabs only:**
  1. **People**: one list with filter chips (Employees, Fund managers, Investors, Founders, Test/demo, Pending invites). Replaces Employees, Everyone else, and the inner People tab.
  2. **Roles & permissions**: role assignment and the permission matrix together. Replaces the outer Roles tab and the inner Roles/Permission Matrix tabs.
  3. **Security & review**: sign-in activity, resets, access audit and Needs review in one place.
- **One "Invite someone" button**, in the page header only (removes the inner Invite tab and duplicate button).
- **Row actions:** primary "View account", with everything else (resend invite, password reset, archive) in a single "More" menu with confirmation.
- **Recent sign-ins** moves into Security & review instead of showing above every tab.
- Sidebar: People & Access becomes one link (no five children). Old links and tab URLs keep working through redirects.

## Account detail page (View account)

Reorganized into clear sections, in this order: Who they are, What they can access (funds, clients, roles), Sign-in & security (password reset, authenticator reset), Activity. Each section has a single "Change" button that opens a short confirm step with a reason where required today.

## Fund managers: fund Team

Today "Team and signers" (in Setup) and "Team access" (on Team page) look like two competing lists.

New layout on one **Team** page:
- One list of people on the fund, each row showing plain badges: "Can sign", "Can log in: Viewer / Assistant / Reviewer", "Invite pending", "Expires on…".
- One "Add person" button: name, email, then simple checkboxes "Signs documents" and "Can log in" (with access level). Saves to the same two records as today.
- Row "More" menu: change access, resend invite, remove access (with confirmation and reason).
- Setup keeps a short summary card linking to Team instead of a second full editor.

## Not changing
- Who may grant, approve or remove access, money/identity protections, Super Admin exceptions, audit logs, staff-not-on-fund-team block, fund-only visibility.

## Technical details
- `ops.people-access.tsx` + `staff-nav.ts`: reduce to 3 tabs (`people`, `roles`, `security`); map old `tab`/`sub` values (employees, others, fund_managers, access, etc.) to new ones in `validateSearch`.
- Merge `employees-panel`, `people-directory` and access-control "People" into one `PeopleList` with filter chips; reuse existing readers and `people-actions.tsx`.
- `access-control-center.tsx`: split its tabs into the Roles and Security tabs; delete duplicate Invite tab.
- `ops-sidebar.tsx`: single People & Access entry.
- `ops.people_.$userId.tsx`: section layout reusing `person-access-manager`, `mfa-reset-panel`.
- Manager: new combined `FundTeamList` on `manager.fund.$fundId.team.tsx` composing `fund-team-access-box` and `team-tab` data; Setup shows summary card. Add test for old-tab-to-new-tab mapping.
- Mobile check at phone width with Playwright.
