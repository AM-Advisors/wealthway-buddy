# Fund Manager and Founder contacts under Clients

## What you'll get
- In the Operations sidebar, **Clients** becomes a collapsible group with three items: **All clients** (today's page), **Fund Managers**, and **Founders**.
- **Fund Managers page:** a searchable table of every fund manager / fund team person across all clients — name, email, client company, funds they're on, invite status (Not invited / Invited / Active), identity check status.
- **Founders page:** the same table for cap-table founders and company contacts — name, email, company, cap tables they're on, invite status.
- Search by name, email or company; filter by client and status.
- Row actions:
  - **Invite** — sends (or re-sends) the existing portal invitation.
  - **Assign** — pick a fund (Fund Managers) or cap table (Founders) and a role; adds them to that fund's team or cap table's people.
- **Add contact** button to create a new person and optionally invite + assign in one step.

## Rules kept
- Only Harmonious staff with client-management permission see these pages; every invite and assignment is re-checked on the server.
- Assigning gives the same default team permissions as today (view/edit/documents/investors); GP, signatory and banking authority still need explicit confirmation.
- Uses the existing contacts, invitation, fund-team and cap-table records — no duplicate people (matching goes through the existing person-matching rule).
- Every assignment is logged in the existing history; nothing is deleted.

## Technical details
- Sidebar: convert the Clients entry in `src/lib/navigation.ts` into a group; new routes `ops.clients.fund-managers.tsx` and `ops.clients.founders.tsx`.
- New `src/lib/client-directory.functions.ts`: `listFundManagerContactsFn`, `listFounderContactsFn` (joins client_contacts, fund_managers/fund team, client_invitations, cap_stakeholders/cap_holder_access, account identity check status), `assignContactToFundFn`, `assignContactToCapTableFn`; invites reuse existing invitation functions. All gated with `requireSupabaseAuth` + ops capability check.
- Shared `ContactDirectoryTable` component (search, filters, invite/assign dialogs).
- Unit tests for filtering/status projection; verify pages in preview.
