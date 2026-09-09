# Manager alerts + full fund walkthrough

## What you'll get

Fund managers and admins get an email the moment something moves on one of their funds — no need to keep checking the portal. Each person can switch these emails off for themselves.

Then I'll walk the whole thing end to end on real data: create a fund, invite a manager, submit an application, and approve its wire.

## When an email goes out

- A new application is started on their fund
- Any status change on an application: identity, background screening, accreditation, documents, funding — including "in review" and "pending", not just approvals
- An investor submits a wire confirmation

Each email is sent immediately, names the investor, the fund, what changed (from → to), the commitment amount, and links straight to that investor's review page.

## Who gets it

Managers assigned to that fund, plus admins. If a fund has no manager yet, admins still get it; if there are no admins, it falls back to operations@harmonious.co.

## Turning it off

A simple on/off switch in the manager panel and in the admin area — per person, applies to all their funds. Off means no alert emails; the portal is unaffected.

## The walkthrough (after the emails are built)

1. Create a real fund with its details, bank details and offering documents
2. Invite a fund manager to it and confirm the invitation email
3. Submit a real investor application against the fund
4. Move it through status changes and confirm the manager alerts fire
5. Submit a wire confirmation as the investor, approve it as the manager, confirm the funding status settles

I'll report each step and clean up anything created purely for testing, unless you want the fund kept. Tell me the fund name/details and the manager's name and email, or I'll use clearly-labelled test values.

## Technical notes

- New table `notification_events` (append-only outbox) written by database triggers on `investor_applications` (insert + status column updates) and `wire_confirmations` (insert). Triggers capture every code path — webhooks, admin actions, investor actions — so no call site can be missed.
- Delivery: a server route `/api/public/notify/drain` (secured with `LOVABLE_CRON_SECRET`) plus an immediate best-effort drain call fired from the existing status-changing server functions, so normal flows send within seconds and the drain acts as a safety net. Rows are claimed with a `sent_at` stamp for idempotency; `idempotencyKey` derived from event id + recipient.
- Recipient resolution reuses the pattern already in `box-sign-complete.server.ts`: `fund_managers` for the offering, plus `user_roles` admins, minus anyone opted out, fallback to operations.
- New table `notification_preferences` (user_id, alerts_enabled) with self-managed RLS; UI toggle in `/manager` and `/admin`.
- New React Email template `manager-alert.tsx` registered in `src/lib/email-templates/registry.ts`, branded to match existing templates (navy #142647, teal #5DC6D1).
- RLS: outbox readable by admins only, written by triggers/service role; GRANTs included in the migration.
