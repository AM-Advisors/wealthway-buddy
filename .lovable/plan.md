# Current-client services, migration payments, reminders, and a role-based Operations sidebar

## 1. Harmonious sets services for current clients
- A new **Services** tab on each client's page in Operations lists everything on the rate card: platform, servicing tier, Fund Administration, à la carte services and cap table plan. Staff tick what the client has today, plus a start date and billing cadence (yearly, quarterly or one-time).
- Saving fills in the client's purchased services. That is what their menu uses once they're switched over.
- A **"Switch to purchased-services menu"** button shows a preview first ("they'll lose: Cap Table, Reports…"). It needs a second staff member to approve, or a Super Admin with a written reason. Until it's switched, the client keeps today's menu.
- Who can edit: Sales, Account Managers and Operations prepare it, and someone else approves. Every change is logged in the client's history.

## 2. Migration funds: what they paid and what's included
- On a migration fund (from the Migrations tab, or after it's approved), staff record:
  - the amount paid, the date paid and the method (wire, ACH, card or other)
  - an optional proof file
  - the period covered
  - which services that payment includes (the same checklist as above)
- This is a **record only**: nothing is charged and no money moves. It needs a second person to confirm, like earlier subscriptions. Confirmed amounts show on the fund's Migration status card and the client's Services tab.

## 3. Payment reminders
- From each client's services, the platform works out what's due next (renewal date and amount, from the cadence and start date or the last recorded payment).
- A new **Payment reminders** list in Operations shows Upcoming (30 days), Due and Overdue.
- Branded reminder emails reuse the existing reminder flow: CC to operations@, logged, daily limit and open/click tracking. They go out at 30 days, 7 days, on the due date, and 7 and 14 days overdue. Staff can pause reminders per client or send one by hand.
- Card-subscription clients get no reminder emails, because their card renews on its own; they're only shown if a payment fails. Reminders never charge, refund or move money. Any "pay now" link opens the client's own card checkout or shows wire instructions for them to act on.
- One daily check sends due reminders. It runs once a day, so the cost stays low.

## 4. What changes for each staff role
| Role group | Sidebar shows | What changes |
|---|---|---|
| Super Admin / Admin | Everything | Can give anyone extra sidebar items |
| Leadership / Executive | Dashboards, Funds, Clients, Sales, Reports (view) | No editing menus |
| Operations | Command Center, Funds & SPVs, Clients, Investors, Onboarding, Documents, Tasks, Migrations | Prepares client services and migration payments |
| Account Managers | Their clients and funds, Tasks, Client approvals, Payment reminders | Prepare services and payment records; can approve someone else's |
| Fund Administration | Funds, Investors, Accounting, NAV, Reports | Sees services read-only |
| Finance | Finance dashboard, Capital, Banking, Accounting, Payment reminders | Confirms migration payments, approves reminder pauses |
| Tax | Tax, Reports | Unchanged |
| Legal | Agreements, Regulatory & filings, SaaS orders review | Reviews self-serve SOWs |
| Compliance | Compliance dashboard, KYC/AML, KYB reviews, Regulatory | Approves business checks |
| Client Success | Clients, Investors, Onboarding, Tasks (view) | Unchanged |
| Sales | Sales Hub only, unless also Operations | Unchanged |

What staff can open is still decided by the server. The sidebar only stops showing what they don't need.

## 5. Sidebar rebuild
- **One list of items:** every item is defined once, each with a single home group. This removes the current duplicates, for example "Migrations" under both Funds and Funds → Migrations, Documents under two areas, and "Tasks" next to "Work queue". Favorites and Recent screens stay as shortcuts.
- **Groups:** Home · Work (Command Center, Work queue, Tasks, Approvals) · Clients & Funds · Investors & Onboarding · Money (Capital, Banking, Accounting, Tax, Payment reminders) · Documents & Regulatory · Sales · Team (People & Access, Mail, Reminders) · Admin.
- **Extra items for individual people:** in People & Access → a person → "Sidebar access", a Super Admin can give someone individual extra items, with a reason. It's logged and can be removed at any time. Granting a menu item also grants permission to open that page. Money, tax filing and administration items still keep their own approval rules.
- **Faster loading:** the menu is worked out once from the person's role and extra items, then reused (no rebuilding on every page change). Sections are remembered, and the menu shows straight away instead of loading in pieces.

## Not included
- Automatic charging, refunds or ACH/wire initiation.
- Switching all current clients' menus at once. Each switch is approved one client at a time from the preview.

## Technical details
- **New tables (all with GRANTs, RLS and an append-only event history):**
  - `client_service_records` (client_id, offering_id nullable, service_key, cadence, amount_cents, start_date, status) — staff edit it through the server, with maker-checker on activation.
  - `migration_payments` (offering_id, client_id, amount_cents, paid_on, method, period_start/end, included_service_keys[], proof_path, status pending/confirmed, confirmed_by) — confirmed only by a different person, or a Super Admin with a reason.
  - `payment_reminder_schedule` (client_id, due_on, amount_cents, stage, paused, last_sent_at), derived from records and payments.
  - `staff_nav_grants` (user_id, item_id, granted_by, reason, revoked_at) — Super Admin only.
- **Sidebar model:** a new pure `src/lib/ops-nav-registry.ts` holds each item (id, title, url, group, icon, required capability or role group). `opsMenuFor(roles, caps, grants)` returns a list with no duplicates. Tests cover no duplicate URLs, each role group's expected items, and extra grants adding items. `ops-sidebar.tsx` renders from it only (the hand-built lists go). The menu is cached per session and held in memory.
- Granted pages pass the server check through `capabilitiesFor` plus the grant's capability, recorded in AGENTS.md. Money-path grants are refused.
- **Reminders:** a once-a-day scheduled call to a stable public route, using the existing branded sender and its daily limits.
- **Client menu switch:** sets `clients.menu_gating='entitlements'` only after approval; the existing `filterByEntitlements` is reused.
