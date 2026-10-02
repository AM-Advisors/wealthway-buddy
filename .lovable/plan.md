# Inbox in the sidebar + Fund Manager preview that always works

## 1. Inbox on the sidebar, for everyone
- Add an **Inbox** item to every menu (client, fund manager, investor, Operations, Sales) with an unread count badge.
- One Inbox page with two parts:
  - **Notices**: the emailed copies (invoices, reminders) that live in today's client inbox.
  - **Conversations**: message threads.
- The old Client Inbox and Messages pages redirect to the new Inbox so existing links keep working.

## 2. Who a client can message
When starting a new conversation, the client picks one recipient:
- **Harmonious Operations** (general team inbox)
- **Harmonious Sales** (general sales inbox)
- **My dedicated representative**: only people actually assigned to their company (from Harmonious Team assignments). Hidden if none assigned.

Who sees each thread:
- Operations inbox: Operations staff only.
- Sales inbox: Sales staff only (no Operations data shown to commercial-only Sales).
- Dedicated rep: that rep, plus admins.
- The client sees only their own company's threads. Investors keep their existing Harmonious / fund manager messaging.
- All checks happen on the server; message history is append-only.

## 3. "View Fund Manager" always available
Today it only lists signed-in fund managers, so new funds show "No client perspective is available yet".
- Add a **Fund Manager preview** perspective that staff can always open for any fund, even with no manager assigned or a manager who hasn't signed in yet (invited only).
- It renders the fund manager screens (fund readiness, To dos, setup progress) from the fund's own records, read-only, labeled "Preview - no fund manager has signed in yet" (or "no manager assigned").
- Real signed-in managers still appear as their own named perspectives.
- Same safeguards as today: staff-only, read-only, time-limited, every start/end logged.
- The empty message only appears for records that truly have no fund (e.g. a bare person record).

## Technical details
- Migration: `inbox_threads` (client_id, channel `operations|sales|rep`, rep_user_id nullable, subject, created_by) + append-only `inbox_messages`; GRANTs + RLS; server fns in `src/lib/inbox.functions.ts` using requireSupabaseAuth; staff team via harmonious-staff.ts, reps via harmonious-team.ts client assignments. Unread via per-user read markers.
- Sidebar entries in client-sidebar.tsx, ops-sidebar.tsx and navigation.ts; new route `/_authenticated/inbox`; `client/inbox` and `messages` redirect.
- view-as.server.ts: `listPerspectives` always appends `{perspective: "fund_manager", subjectUserId: null, preview: true}` when an offering is known; `view_as_sessions.subject_user_id` made nullable with a `preview` flag; `relationshipHolds` for previews checks only that the offering exists; FundReadiness renders via the fund's projection without a subject. Add pending invitations as labeled entries. Update PerspectiveList copy and its test.
- Record rules in src/lib/AGENTS.md.
