# Tech workspace: roadmap, bugs, requests and "What's new"

## Goal
One Tech section in Operations where the Harmonious team sees every bug and enhancement request (from clients, investors, fund managers and staff), triages them into a backlog, plans them on a roadmap, and publishes what changed. It builds on the existing Software issues tracker (reported, in progress, fixed, deployed, retest, resolved) instead of starting a second one.

## What people will see

**Everyone (clients, investors, fund managers, staff)**
- A "Report a problem or suggest an idea" button in the account menu and on the help page.
- A short form: bug or idea, what happened / what you'd like, which page (filled in automatically), optional screenshot.
- For bugs, the page address, browser and time are attached automatically. Typed values and private details are never captured.
- "My reports" shows each submission's status in plain words: Received, Planned, In progress, Released, Not planned (with a short reason).

**Harmonious Tech section (Operations → Tech)**
1. **Inbox:** new reports and automatically caught errors waiting for triage. Actions: Accept to backlog, Merge with a duplicate, Need more info, Not planned.
2. **Backlog:** accepted bugs and enhancements with type, priority, area of the platform, number of people affected and a link to the original reports.
3. **Roadmap:** board with Now / Next / Later / Done columns, plus a target month. Backlog items, Custom services marked "Needs design or build" and existing Software issues all appear here.
4. **Bugs:** the existing Software issues flow (technical owner, retest, resolve), now linked to reports and backlog items.
5. **Caught errors:** page crashes and failed actions collected automatically from the session error tracker, grouped by error and page, with a count and last-seen time. One click turns a group into a backlog bug.
6. **What's new:** release notes written by the Tech team. Each note lists the changes, links to the backlog items it closed, and is marked Staff only or Shown to clients. Harmonious staff see a "What's new" list in Operations; when a released item came from someone's report, they see it as Released in My reports.

## Rules
- Reporters see only their own reports. Clients and investors never see other people's reports, the backlog, the roadmap or caught errors.
- Triage, roadmap and release notes: Super Admin, Product Reviewer and a new Tech team role. Everyone else on staff can view the board.
- Nothing is deleted. Merges, status changes and notes are kept in history.
- Caught errors never store typed values, document contents, tax IDs or bank details, following the existing privacy rules.
- Slack (#operations) gets a notice for each new report and for each error group that crosses a threshold (for example, 5 occurrences in an hour).
- Publishing a release note never sends emails to clients in this phase; it only shows in the app.

## Starting content
- Seed the backlog from known open items already tracked in the platform (open Software issues and pending custom services). No invented items.

## Technical details
- New tables: `tech_feedback` (reporter, audience type, kind bug/idea, page, context, status, merged_into), `tech_backlog_items` (type, priority, area, roadmap column, target month, links), `tech_error_groups` (fingerprint, page, count, first/last seen), `tech_release_notes` + `tech_release_note_items`; all append-only event tables, service-role grants and server functions with role checks.
- Reuse `software_issues` for bug fix lifecycle (link via `backlog_item_id`), `sales_custom_services` design/build items as roadmap sources, the existing session error categories for caught errors, `notifyCustomService`-style Slack sender, and private storage for screenshots.
- New role `tech_team` in `app_role`; menu entry through navigation.ts; Ops routes `/ops/tech` with tabs (inbox, backlog, roadmap, bugs, errors, whats-new); client/investor form as a shared dialog.
- Practice sandbox fixture with fictional reports; pure model tests for permissions, triage transitions and error grouping.
