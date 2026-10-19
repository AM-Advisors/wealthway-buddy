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
- Read src/lib/AGENTS.md before workflow/auth changes — why: scoped rules.
- Partition hosts/menus through host-routing.ts + navigation.ts; share fund engines — why: display grants no authority.
- Never automate filings (except IRS e-filing of approved 1065s/K-1s per src/lib/AGENTS.md), tax payments, refunds, ACH/wire or provider money movement; server-side authorization only — why: user-mandated safety boundary.
- Browser tests live in e2e/*.e2e.ts (Playwright, `bun run test:e2e`), run only against QA with synthetic sessions; helpers refuse production URLs — why: keep them out of unit runs and away from real data.
- Sales uses Operations shell only for authorized Operations staff; commercial-only staff get Sales-only menus — why: no implied authority.
- Server functions import requireSupabaseAuth only from src/lib/require-auth.ts, never the generated module — why: light context avoids preview typecheck limits.
- Client and Operations share fund-workspace.tsx (mode client|harmonious); tab links retain fund ID and audience, staff controls use mode and actions keep server checks — why: one connected fund view, presentation grants no authority.
- Offering Statement projects active fund_fee_terms on read/save — why: matches fund fees, carry and preferred return.
- Setup %: fund-launch-summary.ts; banking: bankSetupStatus; Ops/manager launch: ManagerLaunchCard + invalidateFund — why: shared facts and actions, retained review.
- Fund origin separates new/migration workflows; investor-progress-email uses canonical steps, audit frequency and the existing drain — why: no inferred takeover or duplicate engine.

- Marketing/email/CSA STAR rules: src/lib/AGENTS.md.
- Operations and Account Managers may review/approve others' internal work via src/lib/ops-capabilities.ts (never their own; money paths use capabilitiesFor(roles, { moneyPath: true })); tax, money and administration keep their own approvers - why: user-approved peer approval without widening money authority.
- Submission alerts go only through src/lib/ops-slack-notify.server.ts (best-effort, allow-listed fields, 5-minute dedupe in ops_slack_notifications, tags fund/client operations owner then account manager) - why: one sender, never blocks or leaks sensitive data.
- Approved Didit sessions auto-apply identity details, KYC and AML onto the person via src/lib/didit-auto-apply.server.ts (webhook + questionnaire save; In Review/Declined never auto-apply; every change logged) - why: Didit is the KYC/KYB/AML authority, no duplicate human approval.
- Live portal documents come only from approved document_sources: `box-shared:<link>` (read-only Box, files under allowed_root_ids) or `storage:portal-tax-documents` (private-bucket copies, paths under allowed_root_ids prefixes) in src/lib/document-providers.server.ts; all other live refs are refused - why: per-source Super Admin approval, never a broad Box/Drive connection.
- Fund Drive: offerings.drive_folder_url is the main folder; offerings.drive_links holds staff-only labeled links — why: multiple folders, unchanged permissions.
- Shared Fund Setup: fund-setup-form.tsx + fund-setup-form-model.ts; mode selects save path, never authority — why: one form.
- "Add Fund or SPV" for clients, fund managers, Operations and Account Managers uses one engine (src/components/fund-request-engine.tsx + submitFundRequest); staff mode only skips the client payment after a server-side funds/prepare check - why: one creation path that cannot drift.
- People & Access is the only directory; activity-tracker/user-insights/account-session-status show recorded evidence, never online presence; View account resets reuse admin-checked account-security — why: truthful audit, unchanged authority.
- Client self-serve runs staff-only engines through src/lib/self-serve.server.ts (request-scoped grant per user+fund+scope, opened only after the manager check); never use it for money, filings, identity or pricing - why: fewer approvals without widening authority.
- Help center lives in src/lib/help-catalog.ts (server-only content, loaded inside handlers) + src/lib/help-articles.ts (pure filters); clients see only approved client articles via help_article_reviews - why: staff procedures never ship to client browsers.
- New items awaiting Harmonious review/approval (any Operations work-queue source) post once each to #operations via src/lib/approval-alerts.server.ts, run from the existing 5-minute internal job; first run records the backlog silently - why: one alert path, no extra polling job.

- Fund W-9: fund-w9.server.ts reuses pinned IRS PDFs and signature adoption; immutable fund_w9_signature_requests, assigned-manager-only signing — why: reviewed facts, no impersonation.
- Series/IRS use fund-setup-extras evidence + scoped listFiles — why: one completion source.

- Investor entry uses investor-entry-path.ts; profile evidence uses investor_documents.investment_profile_id with retained originals and canonical requirement projection — why: collect once without approving KYC or reusing fund signatures.

- Portfolio monitoring and Report Cards use portfolio-report-cards.server.ts with immutable version/evidence/decision storage, effective canonical marks, profile-owner-only risk answers and existing diligence/NDA checks — why: adapt V2.5 presentation without importing its financial or access engines.
