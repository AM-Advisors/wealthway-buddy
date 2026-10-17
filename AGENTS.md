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
- Read src/lib/AGENTS.md before engine, authorization or workflow changes (including template provenance) — why: scoped architecture rules.
- Partition hosts/menus through host-routing.ts + navigation.ts; share fund engines — why: display grants no authority.
- Never automate filings (except IRS e-filing of approved 1065s/K-1s per src/lib/AGENTS.md), tax payments, refunds, ACH/wire or provider money movement; server-side authorization only — why: user-mandated safety boundary.
- Browser tests live in e2e/*.e2e.ts (Playwright, `bun run test:e2e`), run only against QA with synthetic sessions; helpers refuse production URLs — why: keep them out of unit runs and away from real data.
- Sales uses the Operations shell for authorized Operations staff, while commercial-only Sales staff get a Sales-only menu — why: presentation must not imply wider Operations access.
- Server functions import requireSupabaseAuth only from src/lib/require-auth.ts (same middleware, light context), never the generated module — why: its Database-typed context exceeds preview typecheck limits.
- Client and Operations share fund-workspace.tsx (mode client|harmonious); tab links retain fund ID and audience, staff controls use mode and actions keep server checks — why: one connected fund view, presentation grants no authority.
- Offering Statement management fee/carry/preferred return are projections of the active fund_fee_terms row (src/lib/offering-statement.functions.ts overwrites them on read and save) - why: the statement must never differ from the fund record.
- Setup %: fund-launch-summary.ts; banking: bankSetupStatus — why: shared facts, replacement review retained.
- Explicit fund_origin via fund-origin.ts separates new/migration panels and records — why: files never imply takeover.

- Marketing (incl. menu groups/post design options), email-flow and CSA STAR rules live in src/lib/AGENTS.md - why: keeps this file within budget.- Operations and Account Managers may review/approve others' internal work via src/lib/ops-capabilities.ts (never their own; money paths use capabilitiesFor(roles, { moneyPath: true })); tax, money and administration keep their own approvers - why: user-approved peer approval without widening money authority.
- Submission alerts go only through src/lib/ops-slack-notify.server.ts (best-effort, allow-listed fields, 5-minute dedupe in ops_slack_notifications, tags fund/client operations owner then account manager) - why: one sender, never blocks or leaks sensitive data.
- Approved Didit sessions auto-apply identity details, KYC and AML onto the person via src/lib/didit-auto-apply.server.ts (webhook + questionnaire save; In Review/Declined never auto-apply; every change logged) - why: Didit is the KYC/KYB/AML authority, no duplicate human approval.
- Live portal documents come only from approved document_sources: `box-shared:<link>` (read-only Box, files under allowed_root_ids) or `storage:portal-tax-documents` (private-bucket copies, paths under allowed_root_ids prefixes) in src/lib/document-providers.server.ts; all other live refs are refused - why: per-source Super Admin approval, never a broad Box/Drive connection.
- Fund setup keeps one main Drive folder (offerings.drive_folder_url) plus a staff-only list of labeled links (offerings.drive_links) - why: funds have many Drive folders; links never change permissions.
- Staff and fund managers share one Fund Setup form (src/components/fund-setup-form.tsx, field layout in src/lib/fund-setup-form-model.ts); mode only picks the save path (staff save vs. manager submission for review), never authority - why: one setup experience that can't drift.
- "Add Fund or SPV" for clients, fund managers, Operations and Account Managers uses one engine (src/components/fund-request-engine.tsx + submitFundRequest); staff mode only skips the client payment after a server-side funds/prepare check - why: one creation path that cannot drift.
- People & Access is the only directory; activity-tracker logs staff_activity_events; user-insights correlates recorded Brevo outcomes; account-session-status never claims online presence; View account MFA resets reuse admin-checked account-security functions and second-person approval — why: discoverable recovery, truthful audit, unchanged authority.
- Client self-serve runs staff-only engines through src/lib/self-serve.server.ts (request-scoped grant per user+fund+scope, opened only after the manager check); never use it for money, filings, identity or pricing - why: fewer approvals without widening authority.
- Help center lives in src/lib/help-catalog.ts (server-only content, loaded inside handlers) + src/lib/help-articles.ts (pure filters); clients see only approved client articles via help_article_reviews - why: staff procedures never ship to client browsers.
- New items awaiting Harmonious review/approval (any Operations work-queue source) post once each to #operations via src/lib/approval-alerts.server.ts, run from the existing 5-minute internal job; first run records the backlog silently - why: one alert path, no extra polling job.
