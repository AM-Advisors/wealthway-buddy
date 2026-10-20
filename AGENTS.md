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
- Read nested AGENTS.md before edits; src/lib/AGENTS.md covers workflows/auth — why: scoped rules.
- Partition hosts/menus through host-routing.ts + navigation.ts; share fund engines — why: display grants no authority.
- Never automate filings (except IRS e-filing of approved 1065s/K-1s per src/lib/AGENTS.md), tax payments, refunds, ACH/wire or provider money movement; server-side authorization only — why: user-mandated safety boundary.
- Browser tests live in e2e/*.e2e.ts (Playwright, `bun run test:e2e`), run only against QA with synthetic sessions; helpers refuse production URLs — why: keep them out of unit runs and away from real data.
- Sales uses Operations shell only for authorized Operations staff; commercial-only staff get Sales-only menus — why: no implied authority.
- Server functions import requireSupabaseAuth only from src/lib/require-auth.ts, never the generated module — why: light context avoids preview typecheck limits.
- Client and Operations share fund-workspace.tsx (mode client|harmonious); tab links retain fund ID and audience, staff controls use mode and actions keep server checks — why: one connected fund view, presentation grants no authority.
- Setup %: fund-launch-summary.ts; banking: bankSetupStatus; Ops/manager launch: ManagerLaunchCard + invalidateFund — why: shared facts and actions, retained review.
- Fund origin separates new/migration workflows; investor-progress-email uses canonical steps, audit frequency and the existing drain — why: no inferred takeover or duplicate engine.

- Marketing/email/CSA STAR rules: src/lib/AGENTS.md.
- Operations and Account Managers may review/approve others' internal work via src/lib/ops-capabilities.ts (never their own; money paths use capabilitiesFor(roles, { moneyPath: true })); tax, money and administration keep their own approvers - why: user-approved peer approval without widening money authority.
- Fund Drive: offerings.drive_folder_url is the main folder; offerings.drive_links holds staff-only labeled links — why: multiple folders, unchanged permissions.
- Shared Fund Setup: fund-setup-form.tsx + fund-setup-form-model.ts; mode selects save path, never authority — why: one form.
- "Add Fund or SPV" for clients, fund managers, Operations and Account Managers uses one engine (src/components/fund-request-engine.tsx + submitFundRequest); staff mode only skips the client payment after a server-side funds/prepare check - why: one creation path that cannot drift.
- People & Access is the only directory; activity-tracker/user-insights/account-session-status show recorded evidence, never online presence; View account resets reuse admin-checked account-security — why: truthful audit, unchanged authority.
- Closed funds: offerings.lifecycle_status (separate from is_open launch) changes only via close_fund/decide_fund_reopen DB functions; DB triggers refuse new onboardings/applications/invites/links on closed funds; reopening needs a different assigned fund manager (Super Admin self-approval with reason) — why: one enforced gate on every path.
- Client self-service (fund managers of that exact fund): onboarding link create/replace/disable, banking path choice (not "not required"), EIN path + existing EIN with letter, fund-manager add/remove (exact-email lookup, never the last manager) and teammate invitations; IRS-issued EIN recording, bank verification, identity, money and pricing stay with Harmonious — why: user-approved self-service audit.
- Ops Funds dashboard reads per-investor readiness from onboarding_readiness_summaries (written by reconcileInvestmentReadiness, refreshed a few stale rows per load), never live computeReadiness for every investor — why: the live loop exceeded Worker request/time limits.
- Investor page self-service (tax ID, owners/signers via editRelatedParty, first distribution bank via addDistributionDestination → requestPaymentInstruction) follows the investor edit window; approved payment destinations change only by investor or Harmonious, and relationships are ended (status removed), never deleted — why: no widened money or identity authority.
- Billing: signed SOW lines carry billing frequency into invoice_schedules; the daily invoice-reminders job drafts invoices only (one line per schedule period via source_ref); issuing needs a different person than the drafter/reviewer (Super Admin with reason); every "paid" path calls onInvoicePaid → commission_payout_queue, and void/refund/dispute cancels still-scheduled rows — why: maker-checker, no double billing, payouts recorded never sent.
