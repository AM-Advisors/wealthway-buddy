# Sales Outreach, Dashboards, Team Management and Quoting

Builds on the existing Sales page, Contacts & deals, staff roles and the SOW/MSA agreements. Sales stays commercial-only: no investor tax, identity, bank or KYC data, and nothing here moves money.

## 1. Sales roles
- Sales roles in the hierarchy: **CRO > Sales Manager > Account Executive > BDR** (sit beside Account Manager, under CEO/Super Admin).
- Assigned on the existing Harmonious Roles page with the same protections (no self-change, never above your own rank, every change logged).
- What each sees:
  - BDR: own contacts, own outreach, lead stages through "Meeting set".
  - Account Executive: own pipeline end to end, quotes (draft and send once approved).
  - Sales Manager: their team's activity, approves quotes inside discount limits, reassigns leads.
  - CRO / CEO / Super Admin: whole team, targets, quotes above the discount limit, custom prices (keeps the current CEO/CRO price-approval rule).

## 2. Outreach channels (Sales > Outreach)
- One outreach timeline per contact with four channels: **Email, Text, WhatsApp, LinkedIn**, plus logged **Calls**.
- Email: sent through Brevo, consent and unsubscribe rules unchanged.
- Text and WhatsApp: sent through Twilio (needs connecting; until then reps can log them manually). Opt-out ("STOP") honoured automatically.
- LinkedIn: nothing is pulled automatically. The rep chooses what to bring in:
  - "Pull in" button opens a prompt where the rep pastes a conversation or profile snippet; AI tidies it into dated messages and suggested contact fields.
  - The rep ticks which messages/fields to keep and which are visible to the team, then saves. Nothing is saved without that review.
  - LinkedIn sends stay on LinkedIn; the app records them only when the rep logs them.
- Every outreach item records who, channel, direction, when, message text, service of interest and resulting stage. History can be added to but not edited.

## 3. Pipeline stages
Outreach → Connected (Email / LinkedIn / Call / WhatsApp) → Meeting set → Meeting held → Quoted → Contract sent → Contract won / Contract lost, plus **Contact later** (with follow-up date). Each stage change keeps a timestamp so time-in-stage can be measured.

## 4. Main Sales Dashboard
- Date filter: Day, Week, Month, Quarter, Year, Custom (shared by all dashboards).
- Totals for outreach as a team, per employee, per channel, per service.
- Circle chart: outreach vs connected (with connect rate), and a funnel/bar of every stage.
- Click any number, slice or bar to drill down: employee → channel → contact list → the actual messages with date, time and channel.

## 5. Per sales rep overview
- Card per rep: current stage counts, outreach this period, connect rate, meetings, revenue closed, revenue pending (open quotes/contracts), win rate.
- Same date filter. Reps see only themselves; managers see their team; CRO sees all.
- For each of the rep's clients: assigned Operations contact and Account Manager.

## 6. Extra management tools for CRO / Sales Manager
- Targets/quotas per rep per period with attainment bars.
- Forecast: pending revenue weighted by stage.
- Activity leaderboard and "stale deals" list (no touch in X days, overdue Contact later).
- Lead assignment / reassignment and round-robin for new inbound leads.
- Win/loss reasons required on Contract lost, with a reasons report.
- Average time in each stage and average deal size by service.
- Rep's personal "Today" list: follow-ups due, replies waiting, quotes awaiting signature.

## 7. Quoting engine
- Build a quote from the live rate card: pick services, quantities, setup fee; discounts shown against baseline.
- Flow: **Draft → Approval → Sent → Signed**.
  - At or above baseline: Sales Manager approves. Below baseline / custom price: CEO or CRO (existing rule). The person drafting cannot approve.
- Approved quote creates the SOW (and the MSA if the client doesn't have one) through the existing agreement drafting, so the same signing flow is used.
- Signing moves the deal to Contract won and counts the revenue as closed; quotes are versioned, never overwritten.

## Not included
- Automatic LinkedIn scraping or sending (against LinkedIn's terms and your instruction).
- Payments, filings or any money movement.

## Technical details
- New roles: extend `app_role` with `account_executive` and `bdr`; reuse `cro`, `sales_management` (labelled Sales Manager). Update `staff-role-hierarchy.ts` and record the rule in `src/lib/AGENTS.md`.
- Tables (with GRANTs + RLS, append-only triggers where noted): `sales_outreach` (append-only; channel, direction, body, sent_at, contact_id, owner_id, service_code, visibility), `sales_stage_events` (append-only), `sales_targets`, `sales_quotes` + `sales_quote_lines` + `sales_quote_events` (append-only), `sales_loss_reasons`. Extend `crm_deals` with stage, service, amount, follow_up_at.
- Server functions in `src/lib/sales-outreach.functions.ts`, `sales-dashboard.functions.ts`, `sales-quotes.functions.ts` using `requireSupabaseAuth` from `src/lib/require-auth.ts`; visibility derived server-side from role + ownership.
- LinkedIn "Pull in": server fn calling Lovable AI to parse pasted text into structured messages; returns a preview only, saved on explicit confirm.
- Twilio connector for SMS/WhatsApp sending and an inbound webhook under `src/routes/api/public/` with signature verification for replies and STOP.
- Quote → SOW via existing `agreements-admin`/`client_sows` drafting; pricing from `pricing_versions`, approvals reuse `PRICE_APPROVER_ROLES`.
- Routes: `/sales` (dashboard), `/sales/outreach`, `/sales/team`, `/sales/reps/$id`, `/sales/quotes`, `/sales/quotes/$id`; Commercial sidebar entries gated by role. Recharts for circle/bar charts.
