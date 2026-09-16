# Migration concierge — "Have Harmonious do it for me"

Today a founder can upload their Carta/Pulley/spreadsheet export, map it, fix lines and accept it
themselves. There is a single "request concierge review" button that only stamps a date and a note —
nobody is assigned, nothing tracks progress, and there is no way for us to raise questions back.

This builds the concierge properly: a founder hands the file over, a named Harmonious specialist
picks it up and works it in a staff workspace, anything unclear comes back to the founder as a
question, and the founder signs off before a single share is recorded.

## Founder experience

On the migration screen, alongside "I'll do this myself", a clear **Have Harmonious do it for me**
option. Choosing it opens a short handover form: what the file is, any context we should know, who
to contact, and how urgent it is. The founder then sees a live workspace card for that migration:

- Who is looking after it — specialist name and the date they picked it up.
- Where it has got to: Received → Assigned → In preparation → Questions for you → Ready for your
  review → Recorded. Each stage shows when it was reached.
- **Questions for you** — every exception we hit, in plain language ("Line 34: two holders share the
  certificate number CS-12 — which is correct?"), with a box to answer. Answered questions move to a
  resolved list so nothing is lost.
- **Your review** — when we finish, the founder sees the prepared cap table: total shares, holders,
  what is new versus matched to existing records, and every line. They approve, or send it back with
  a reason.

Nothing is written to the official cap table until the founder approves. Harmonious prepares; the
founder decides. The concierge is available only where the client's active scope includes it, and
otherwise shows the standard out-of-scope message.

## Harmonious staff experience

A new **Cap table migrations** page in the staff console:

- A queue of every concierge case: company, provider, rows, stage, specialist, days waiting, and
  whether the founder currently owes us an answer. Filters for unassigned, mine, waiting on founder
  and ready to record.
- Assign to me / reassign, plus a target date.
- Opening a case gives the full working view: the mapping, every row with its problems, the
  reconciliation against what is already recorded, and controls to correct columns and rows on the
  founder's behalf.
- Raise an exception against a specific line or the batch as a whole; the founder sees it and
  answers, and the answer appears against the exception.
- Internal notes the founder never sees.
- Send for founder review when the batch is clean; record it once the founder has approved.

Staff with contract authority can assign, work and record a case. Other staff can view the queue.
Demo companies stay read-only.

## Technical detail

**Database (one migration)**

- `ct_concierge_cases` — one per migration: `migration_id`, `company_id`, `stage`
  (`received | assigned | preparing | awaiting_founder | founder_review | recorded | cancelled`),
  `assigned_to`, `assigned_at`, `target_date`, `priority`, `founder_note`, `contact_name`,
  `contact_email`, `prepared_summary` (jsonb), `review_status` (`pending | approved | changes_requested`),
  `reviewed_by`, `reviewed_at`, `review_note`, `recorded_at`, timestamps + trigger.
- `ct_concierge_exceptions` — `case_id`, `company_id`, `migration_row_id` (nullable), `question`,
  `detail`, `status` (`open | answered | resolved`), `founder_response`, `responded_by/at`,
  `resolved_by/at`.
- `ct_concierge_notes` — internal staff notes on a case.
- GRANTs to `authenticated` and `service_role`; RLS so founders see only their own company's case
  (via `ct_can_manage` / `ct_can_view`) and staff see all via `ct_is_staff()`. Founders may only
  write their own exception answers and their review decision; stage, assignment and notes are
  staff-only.

**Server functions** — new `src/lib/captable-concierge.functions.ts`: `startConciergeCase`,
`getConciergeQueue`, `getConciergeCase`, `assignConciergeCase`, `setConciergeStage`,
`raiseConciergeException`, `answerConciergeException` (founder), `resolveConciergeException`,
`addConciergeNote`, `sendForFounderReview`, `submitFounderReview`, `recordConciergeMigration`.
Every mutation writes to `ct_events` with the existing `migration` entity type, so the audit history
and compliance pages pick it up with no change.

`importCapMigration` gains a guard: when a concierge case exists, it can only run once
`review_status = 'approved'`, and it stamps the case as recorded. The existing self-serve path is
unchanged. `requestCapConcierge` becomes a thin wrapper that opens a case, so old batches keep working.

**UI**

- `src/components/captable/concierge-panel.tsx` — founder card (stage timeline, specialist,
  questions, review + approve/send back) embedded in `migration-view.tsx`, replacing the current
  concierge dialog with the fuller handover form.
- `src/components/captable/concierge-workspace.tsx` — staff case view, reusing the existing mapping
  and row-review components rather than duplicating them.
- `src/routes/_authenticated/admin.cap-table-migrations.tsx` — queue + case workspace, with its own
  page metadata; sidebar link next to Cap table requests, showing a count of cases needing attention.

**Notifications** — branded portal-inbox message and email to the founder when a specialist is
assigned, when new questions are waiting, and when the batch is ready for review; internal alert to
the assigned specialist when a founder answers. Idempotent, matching the existing invoice-email
pattern.

No provider APIs; the file remains the source. No automatic recording of anyone's shares.
