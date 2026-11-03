# Team workspace: clear work, handoffs and issue retesting

Built in three small increments, each tested before the next. No permission changes, no automatic assignment, no messages sent, no financial or compliance decisions changed, and nothing is published.

## What already exists (reused, not duplicated)
- One authorized Operations work queue that collects items from every workflow, filtered by staff capabilities.
- Staff tasks with owner, team, due date, status (open, in progress, blocked, done, cancelled), responsibility status, a "waiting on" party, follow-up date and a permanent event history.
- Sales-to-Operations handoffs on staff tasks, and syncing of request and task owner, team and due date.
- Diagnostics readers and the fictional QA sandbox.

The uploaded patch was never applied. I'll recreate its Phase 1 changes against the current code rather than applying it as-is.

## Phase 1: Reliable work visibility
- Work-area pages ask the server for their own workflows, grouped where needed (for example Accounting and Reports), before splitting into pages. Today the page loads the first 100 items overall and filters afterward, so relevant work can be missed.
- Three views: **All work**, **My work** and **Needs owner**. "Needs owner" means no recorded owner. A name-only recorded owner still counts as an owner, and workflows that don't support assignment are labeled separately.
- Each row shows the recorded owner, next action, due date, blocker and follow-up date where they exist.
- Previous and Next page controls that go back to page 1 when the view or area changes.
- A failed load shows an error with **Retry**, never "nothing waiting".
- When a source fails or reaches its read limit (200 rows), the page shows a visible notice: "Some work may not be shown." It never presents those results as complete or all clear. The same notice is added to the Approvals inbox and Stalled items.
- Access filtering still happens before any record is returned.

## Phase 2: Clear handoffs and completion (on existing staff tasks)
- One accountable owner per task, using the existing owner field.
- **Handoff:** the sender names the receiving owner. The task shows "Awaiting acceptance" until the receiver clicks **Accept**, or clicks **Something's missing** and writes what's needed. Ownership changes only on acceptance.
- **Blocked or waiting:** the accountable owner keeps the task. A next action, target date and next follow-up are required.
- **Complete:** a short completion note is required, with an optional link to the record. Routine completion never creates a new approval. Existing approval requirements stay as they are.
- Every change is written to the existing task history. Owner or due-date changes on tasks linked to requests go through one combined save, so the two records never disagree.
- Both people see the handoff in **My work**. No emails or alerts are sent.

## Phase 3: Software issue intake and verification
- A **Report a software issue** form for staff: what was expected, what happened, steps to reproduce, business impact, page, when it happened and an optional record reference (only records the reporter can access).
- It names a technical owner and an operational retester.
- Separate stages: Reported, In progress, Fixed, Deployed, Retest passed or Retest failed, then Resolved. Only the named retester can mark a retest passed, and an issue can only be resolved after a passed retest.
- No automatic screenshots or capture of documents, bank details, tax IDs, passwords or screening details. The form warns people not to paste them. No external services are contacted.
- Retesting points to the fictional QA sandbox, never real records.

## Final report
At the end I'll separate what was **implemented**, **checked by tests**, **published** (nothing, unless you ask) and **accepted by your team** (needs signed-in QA). I'll also list anything left unresolved.

## Technical details
- Phase 1: add `areas[]` and `unassigned` filters in `ops-work-items.ts` and `ops-work-queue.functions.ts`. Replace `safely()` and `.catch(() => [])` in `ops-work-queue.server.ts` with per-source results that report failed or truncated sources (a row count equal to `SOURCE_LIMIT`) and return `{ items, total, partial, failedSources }`. Update `ops.areas.$area.tsx` to use server paging (8 per page), the three views, `LoadError` with Retry and the partial notice. Add an `assignable: false` marker for collectors without assignment.
- Phase 2: add nullable columns to `staff_tasks`: `handoff_to_user_id`, `handoff_requested_at`, `handoff_accepted_at`, `handoff_issue`, `next_action`, `completion_note` and `completion_ref`. Add one `SECURITY DEFINER` transition function (service role only) for request, accept, report issue, block and complete. It writes `staff_task_events` and handles linked fund requests in the same transaction. Existing status values are reused, with no new queue or status system.
- Phase 3: add a `software_issues` table linked to a `staff_tasks` row (`related_workflow_type = 'software_issue'`) holding the structured fields, owner, retester and stage, plus append-only stage events. It is service role only and accessed through authorized server functions. The stage order and retester rule are enforced in the database.
- Tests: work beyond 100 global items, combined area and owner filters, restricted records stay hidden, empty, failed, partial and truncated states, handoff acceptance and linked-record consistency, blocked tasks keeping their owner and follow-up, retest gating before resolution.
