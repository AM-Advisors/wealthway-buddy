# Reorganize the Harmonious sidebar: Operations, Sales, Account Management

## New sidebar layout
Each section has a header you can click to collapse or expand it. The section you're working in opens automatically, and the open/closed choice is remembered on this device. When the sidebar is shrunk to icons, each section shows its icons only.

```text
Home
Search (Find a screen)

OPERATIONS                      (Operations staff)
  Work queue
  Clients         > Fund Managers, Founders
  Funds & SPVs    > Fund Setup, EIN/SS-4 queue, Documents & signatures
  Investors       > Identity checks (KYC review)
  Companies
  Money           > Banking, Distributions, Capital calls
  Accounting & Reports > NAV, Financial reviews, Financials
  Tax
  Regulatory & filings > Close requests, Compliance

SALES                           (Sales roles and leadership)
  CRO dashboard   (CRO, Sales Manager, CEO, Super Admin only)
  Sales dashboard
  Pipeline        (current Sales page)
  Outreach
  Quotes
  Contacts & deals
  Sales team
  Pricing approvals

ACCOUNT MANAGEMENT              (Account Managers / Client Success and leadership)
  AM dashboard    (new)
  My clients
  New client hand-offs (new)
  Renewals & expansion (new)
  Service requests
  Invoices & payments
  Client activity

ADMINISTRATION                  (unchanged: roles, access, settings)

Inbox
```

- Each section appears only for people with the matching role. Leadership (CEO and Super Admin) sees all three.
- Sales-only staff keep their simpler menu: Sales, plus Account Management if they also hold that role. They still never see Operations.
- Every page keeps its own server-side permission check. The menu only controls what's shown, never what someone can access.

## Account Management: what it should include
An account manager looks after clients once they're signed, so their tools focus on keeping clients healthy and growing.

**AM dashboard (new page)**, filtered to the manager's assigned clients (leaders see all):
- Totals: clients, active funds, funds in setup, unpaid invoices, and open service requests.
- **Client health list:** a clear Healthy / Needs attention / At risk label for each client, worked out from things already tracked: stuck funds, overdue tasks, unpaid invoices, messages with no reply, and days since the client was last active.
- **New hand-offs:** clients whose SOW was signed in the last 30 days, with the draft fund created from the quote and whether setup has started.
- **Renewals & expansion:** SOWs reaching their end date within 90 days, plus clients using fewer services than their package allows. Both are flagged for a conversation; nothing is sold automatically.
- **Waiting on you:** client messages, service requests and sign-offs for your clients.
- A chart of funds by setup stage, plus a circle chart of client health.

**New list pages:** New client hand-offs and Renewals & expansion. Each opens from the dashboard and works as its own filterable list.

**Existing pages reused:** My clients, Service requests, Invoices, and Client portal activity.

## Operations section
The current Operations areas are grouped under one Operations heading, with their key screens shown underneath as collapsible sub-items. A new "Regulatory & filings" entry groups Close requests and Compliance, which are currently buried inside other areas. The Sales screens currently listed inside Operations' Clients area ("Contacts, deals & campaigns" and "Sales & pricing approvals") move to the Sales section.

## Technical details
- `src/components/ops-sidebar.tsx`: replace the flat groups with three collapsible sections built from shadcn `Collapsible` and `SidebarMenuSub`, with open state saved in localStorage per section and auto-opened by the current path. Sales and Account Management items move to a small config in `src/lib/navigation.ts` with role lists.
- `src/lib/ops-capabilities.ts`: add a `regulatory` menu entry with sub-items, and move the two Sales screens out of `clients.screens`. Update the related sidebar tests (`ops-sidebar-cleanup.test.ts`, `navigation.test.ts`).
- New `src/lib/account-management.server.ts` and `.functions.ts`: `amDashboard`, `amHandoffs` and `amRenewals`. They are read-only, scoped through `client_team_assignments` and `client_assignments` (leaders see all), and reuse fund-health `stuckFlags`, `client_sows` end dates, `sales_quotes.onboarded_*`, invoices, inbox threads and service requests. The health score is a pure function in `src/lib/account-health.ts` with unit tests.
- New routes `account-manager_.handoffs.tsx` and `account-manager_.renewals.tsx`. `/account-manager` becomes the AM dashboard, with the current list kept as its "My clients" panel. Every route gets its own head() metadata.
- Add an AGENTS.md rule: Account Management views are read-only projections, and health never gates work.
- Verify with unit tests and Playwright screenshots of the sidebar (expanded, collapsed and icon-only) and the AM dashboard.
