# Client dashboard: attention, notifications, customization and earnings

## 1. Everything that needs the client, in one place
- When a client opens the portal, a pop-up lists every item waiting on them: signatures, approvals, missing information, open invoices, SOWs to sign, countersigns and fund setup tasks. Each item has a "Go" button.
  - They can close it for the rest of that session.
  - It comes back the next time they sign in if anything is still open.
- The current "Waiting on you" list moves to the top of the dashboard.
- Both use the existing attention list, so nothing new is guessed. Only real open items appear.

## 2. Notifications
- **Bell in the portal header.** It shows an unread count and a list of recent notices. Each notice links to the item, and the client can mark notices read one at a time or all at once.
- **Email** when a new item needs them. It uses the existing manager alert emails and shows status only, never amounts, investor or bank details.
- **Browser push (opt-in).** A button labelled "Turn on alerts on this device". It only works after the client allows it in the browser, and some phones (iPhone needs the app added to the Home Screen) have limits. Push messages carry the same status-only wording.
- Each client chooses which channels they want under notification settings.

## 3. Customizable dashboard
- An "Customize" button lets each person:
  - show or hide cards
  - drag cards into their own order
  - pick a default time period (month, quarter, year or all time)
  - pick a default fund (or all funds)
- Choices are saved per person and don't affect teammates. "Reset to default" restores the standard layout.

## 4. Breakdown by fund and service, with graphs
- Filters: fund, service, and period (per deal, month, quarter, year, all time).
- **Harmonious costs:** what the client has been invoiced and has paid for each fund and each service, from their invoices and SOWs. Bar chart over time, plus a table by service.
- **Capital raised:** committed and funded per deal and over time. Line chart.
- **Fees and carry earned:** management fees and carried interest recorded in each fund's books. Carry shows only when it's actually recorded, never estimated. Stacked bar chart.
- **Net view:** fees and carry earned, minus Harmonious costs, per deal and period. It's labelled as a summary, not accounting statements.
- These figures are shown separately and never mixed together. Empty states explain when a fund has no recorded fees yet.
- The client sees only their own funds. Hidden fund totals stay hidden from anyone not entitled to them.

## Design
- Harmonious navy and teal, Rubik headings.
- Summary tiles with trend arrows, then charts and a fund comparison table.
- Works on phones: cards stack and charts scroll sideways.

## Not included
- No money movement, payments or filings are triggered from the dashboard.
- No changes to invoices or fund records. Everything is read-only.

## Technical details
- Step 1: confirm where earned management fees are posted (fund books/journal or management-fee charge records) and which carry rows count as "recorded". Figures come only from posted rows.
- New `client-dashboard-insights.server.ts` + `.functions.ts`:
  - `requireSupabaseAuth` and an exact-client membership check
  - aggregates invoices (by `offering_id` and SOW service lines), onboardings (raised) and posted fee/carry rows
  - bucketed by deal/month/quarter/year/all, in integer cents
  - pure bucketing in `client-dashboard-model.ts` with tests
- Migration:
  - `client_dashboard_prefs` (user_id, client_id, layout jsonb, default_period, default_fund_id), with owner-only RLS
  - `client_notifications` (user, client, kind, title, path, read_at), with owner read/update RLS and service-role insert
  - `push_subscriptions` (user, endpoint, keys), owner-only
  - GRANTs on all three
- The attention pop-up reuses `getAttention`. The bell reads `client_notifications`, which are written alongside the existing `notifyFundManagers` events.
- Web push:
  - standard VAPID keys stored as secrets, and a small messaging service worker used only for push (no offline caching)
  - registration is skipped in the preview and in frames
  - sending is server-side through a Worker-compatible library, so it needs the Cloudflare runtime check first
- Charts use recharts (already installed). Drag reorder uses a lightweight sortable list.
- Tests cover period bucketing, the net calculation, per-person preferences and membership denial.
