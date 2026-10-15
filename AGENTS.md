<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Domain/architecture rules live in src/lib/AGENTS.md; read it before changing any engine, authorization or workflow — why: keeps this file small.
- Partition addresses/menus through host-routing.ts + navigation.ts; share fund engines — why: separation never grants authority.
- Never automate filings (except IRS e-filing of approved 1065s/K-1s per src/lib/AGENTS.md), tax payments, refunds, ACH/wire or provider money movement; server-side authorization only — why: user-mandated safety boundary.
- Browser tests live in e2e/*.e2e.ts (Playwright, `bun run test:e2e`), run only against QA with synthetic sessions; helpers refuse production URLs — why: keep them out of unit runs and away from real data.
- Sales uses the Operations shell for authorized Operations staff, while commercial-only Sales staff get a Sales-only menu — why: presentation must not imply wider Operations access.
- Server functions import requireSupabaseAuth from src/lib/require-auth.ts (same runtime middleware, light context type), never the generated module directly - why: the generated Database-typed context made the whole-app typecheck exceed the preview time limit.
- The client fund page and the Operations fund setup page share src/components/fund-workspace.tsx (mode client|harmonious); Harmonious-only controls are gated by mode and every action keeps its own server-side check - why: one fund view that can't drift, display mode never grants authority.
- Offering Statement management fee/carry/preferred return are projections of the active fund_fee_terms row (src/lib/offering-statement.functions.ts overwrites them on read and save) - why: the statement must never differ from the fund record.
- Fund setup % and launch label come only from src/lib/fund-launch-summary.ts (tasks + launch conditions) on Fund Setup and Readiness - why: the same fund must show one number everywhere.
- Classroom articles live in classroom_articles + append-only classroom_article_versions/events (src/lib/classroom.server.ts); public pages read only published versions via src/lib/classroom-public.functions.ts, and /post/<slug> addresses never change - why: keeps Wix URLs and rankings while allowing versioned AI drafts.
- Social post artwork uses shared marketing brand font definitions and original logo asset pointers, and export waits for brand font loading — why: saved artwork must match the preview without fallback typography or distorted logos.

- Marketing (incl. menu groups/post design options), email-flow and CSA STAR rules live in src/lib/AGENTS.md - why: keeps this file within budget.- Legacy archive uploads go only through src/lib/legacy-archive-multipart.server.ts (dedicated bucket + prefix guard, signed SHA-256 per request, 5 MiB parts, no delete/retention headers) - why: Object Lock needs signed checksums and the gateway caps requests near 6 MiB.
- Operations and Account Managers may review/approve others' internal work via src/lib/ops-capabilities.ts (never their own; money paths use capabilitiesFor(roles, { moneyPath: true })); tax, money and administration keep their own approvers - why: user-approved peer approval without widening money authority.
- Submission alerts go only through src/lib/ops-slack-notify.server.ts (best-effort, allow-listed fields, 5-minute dedupe in ops_slack_notifications, tags fund/client operations owner then account manager) - why: one sender, never blocks or leaks sensitive data.
- Approved Didit sessions auto-apply identity details, KYC and AML onto the person via src/lib/didit-auto-apply.server.ts (webhook + questionnaire save; In Review/Declined never auto-apply; every change logged) - why: Didit is the KYC/KYB/AML authority, no duplicate human approval.
- Live portal documents come only from approved document_sources: `box-shared:<link>` (read-only Box, files under allowed_root_ids) or `storage:portal-tax-documents` (private-bucket copies, paths under allowed_root_ids prefixes) in src/lib/document-providers.server.ts; all other live refs are refused - why: per-source Super Admin approval, never a broad Box/Drive connection.
- Fund setup keeps one main Drive folder (offerings.drive_folder_url) plus a staff-only list of labeled links (offerings.drive_links) - why: funds have many Drive folders; links never change permissions.
- Staff and fund managers share one Fund Setup form (src/components/fund-setup-form.tsx, field layout in src/lib/fund-setup-form-model.ts); mode only picks the save path (staff save vs. manager submission for review), never authority - why: one setup experience that can't drift.
- "Add Fund or SPV" for clients, fund managers, Operations and Account Managers uses one engine (src/components/fund-request-engine.tsx + submitFundRequest); staff mode only skips the client payment after a server-side funds/prepare check - why: one creation path that cannot drift.
- User lists live only in People & Access; every signed-in user's page views/click labels go to staff_activity_events (src/components/activity-tracker.tsx), shown at /ops/people/$userId - why: one people list, full activity trail.
