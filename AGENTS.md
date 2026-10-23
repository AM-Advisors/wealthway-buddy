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
- Read src/lib/AGENTS.md for workflows/auth, billing, signing, drafts and wealth — why: scoped rules.
- Fund generation is Harmonious-staff-only across templates, starter drafts and standard forms; DOCX autofill reads active fees, formats percentages and flags fixed legal conflicts without auto-activation — why: staff own generation, canonical facts never overwrite signed history.
- Starter side-letter selections share sl_combined rendering in fund-doc-templates.ts, with separate values for each selected item; legacy keys remain readable — why: one document contains all requested terms without mixing fee/carry values or changing signed history.
- Default investors use null class keys; ClassAssignmentCard and investor-scoped SideLetterRegistry link exceptions, with investor-term-fields preserving separate fee/carry/minimum inputs — why: defaults and signed history stay intact.
- Operating Agreement sends verify recorded signatory/title and pin private PDFs; staff-designated signed replacements promote atomically new-only with stale-version guards. Tracker manual notes never execute or publish — why: exact copies and retained investor history.
- Quote cadence uses quote-billing.ts in the editor and authorized saves; compare prices per selected bill using recorded cadence rates before proportional fallback — why: quarterly prices must not be compared with annual baselines, and signed history remains untouched.
- Investor questionnaire prefilling uses subscription-prefill.ts on authorized onboarding reads and saves; fill only blank exact-party facts and preserve dirty form answers — why: reuse recorded details without account/party confusion or inferred certifications.
- Partition hosts/menus through host-routing.ts + navigation.ts; share fund engines — why: display grants no authority.
- Operations Slack URLs and verification confirmation filtering use verification-alert-model.ts through the existing ops-slack-notify sender; authoritative verification save paths emit safe, deduplicated notices without changing decisions — why: unassigned ownership is routing only, and screening details stay private.
- Never automate filings (except IRS e-filing of approved 1065s/K-1s per src/lib/AGENTS.md), tax payments, refunds, ACH/wire or provider money movement; server-side authorization only — why: user-mandated safety boundary.
- Browser tests live in e2e/*.e2e.ts; global-setup.ts blocks before navigation unless reviewed isolation evidence, actual nonproduction backend identity, frontend binding and backend-classified synthetic sessions agree; absent sessions fail, never skip — why: a preview hostname cannot prove safe QA.
- Diagnostics reuse existing health/audit/email/job readers and diagnostic-read.ts/diagnostic-filter.ts; omit provider text/notes; recipient-only emails are admin-only; staleness is display-only — why: privacy.
- Sales menus follow resolved staff roles; invoice ACH/wire links reuse /ops/billing/payment-instructions and its remittance engine — why: no duplicate settings or implied authority.
- Server functions import requireSupabaseAuth only from src/lib/require-auth.ts, never the generated module — why: light context avoids preview typecheck limits.
- Fund workspace keeps fund/audience and mounts selected tabs only; bank surfaces share FundBankingReview + BankInstructionRelease using existing review/status/release functions — why: connected actions, unchanged authority.
- Setup %: fund-launch-summary.ts; banking: bankSetupStatus; launch: ManagerLaunchCard; setup refresh: invalidateFund — why: shared facts, scoped refresh.
- Fund origin separates new/migration workflows; investor-progress-email uses canonical steps, audit frequency and the existing drain — why: no inferred takeover or duplicate engine.

- Marketing/email/CSA STAR/direct signing-email rules: src/lib/AGENTS.md.
- Operations and Account Managers may review/approve others' internal work via src/lib/ops-capabilities.ts (never their own; money paths use capabilitiesFor(roles, { moneyPath: true })); tax, money and administration keep their own approvers - why: user-approved peer approval without widening money authority.
- Fund Drive: offerings.drive_folder_url is the main folder; offerings.drive_links holds staff-only labeled links — why: multiple folders, unchanged permissions.
- Shared Fund Setup: fund-setup-form.tsx + fund-setup-form-model.ts; mode selects save path, never authority — why: one form.
- Fund requests share FundRequestEngine + submitFundRequest; staff payment skip needs server funds/prepare — why: one creation path.
- People & Access is the only directory; activity views show recorded evidence, never online presence; View account resets use admin-checked account-security — why: truthful audit, unchanged authority.
- Closed funds: offerings.lifecycle_status (separate from is_open launch) changes only via close_fund/decide_fund_reopen DB functions; DB triggers refuse new onboardings/applications/invites/links on closed funds; reopening needs a different assigned fund manager (Super Admin self-approval with reason) — why: one enforced gate on every path.
- Client self-service (fund managers of that exact fund): onboarding link create/replace/disable, banking path choice (not "not required"), EIN path + existing EIN with letter, fund-manager add/remove (exact-email lookup, never the last manager) and teammate invitations; IRS-issued EIN recording, bank verification, identity, money and pricing stay with Harmonious — why: user-approved self-service audit.
- Ops Funds dashboard reads per-investor readiness from onboarding_readiness_summaries (written by reconcileInvestmentReadiness, refreshed a few stale rows per load), never live computeReadiness for every investor — why: the live loop exceeded Worker request/time limits.
- Investor surfaces: /investment/$onboardingId workspace; /investor-reporting?section= canonical reports (old pages redirect); /admin/investors redirects to Ops Investor 360; capital reads onboardings with application history; funding/wire retain applications pending review — why: connected views without money-path changes.
- LoadError handles failures; reports load active tabs; Sign shares TaxSignPanel and verified email; OfferingDocumentReader reads entitled files — why: reliability.
- Investor classes use offerings.has_multiple_classes — why: no inferred classes.
- approveToFund allows admin staff/exact-fund managers, never self — why: staff approve, signatories sign; money/identity unchanged.
- Inbox channels and the automatic fund onboarding email depend on the fund's active service level via src/lib/inbox-policy.ts — why: one rule for Self Serve vs paid.
- Migrated client billing (past fees/invoices/payments, generated or uploaded SOWs, commission hand-off) lives in migrated-billing.server.ts; commissions reuse the signed-quote engine via a recorded quote, and the recorder can't also push to commissions — why: one commission engine, maker-checker kept.
- Payment selection/reporting uses payment-planning.ts and PaymentPlanner; payment_plan_versions stores actor-owned append-only planning snapshots after canonical authorized reads, never changes invoice terms or commission queue deadlines — why: reporting cadence and planning cadence must be independent without implying payment authority.
- Existing contact/person selection uses SearchableSelect over each caller's entitled options; FundPersonPicker retains identity badges and multi-recipient controls retain independent selections — why: consistent suggestions without a global directory or broader access.
- Missing Sales quote/document recipients use the existing CRM prospect engine with record-scoped authorization and conditional, audited assignment before sending; no client membership is granted — why: add contacts inline without replacing sent recipients or duplicating identity/access workflows.
- CRM companies use durable owner/fund-scoped crm_companies links; company history reads only individually entitled contacts and deals through crm.server.ts, while title/phone edits retain existing contact saves and audits — why: connected prospect records without a second directory, inferred identity merges or expanded access.
- Sales client-response instructions and staff sends use sales-response-model/server/functions and existing append-only quote/document events; recipient feedback is append-only sales_client_response_events under version-bound acceptance links, while event-bound response emails never alter approved terms or signature/invoice state — why: truthful client attribution without a parallel signing authority or fake staff actors.
- Signed-SOW commission handoff uses commission-notify.server.ts and the canonical queueInvoicePayouts engine; event-bound assigned-rep notices use managed delivery, while only paid invoices receive quarter-end queue rows — why: one commission engine, retry-safe notices and no automatic money movement.

- Forecasts are projections only, gated server-side by a contracted and paid subject-specific Forecasting add-on; immutable versions and sharing events never alter canonical records or trigger money movement.
- Forecast assumption forms edit the existing ForecastInput through forecast-assumption-form.tsx; forecast-form-model.ts handles display-unit conversions and holding selection without mutating baseline records — why: guided input preserves saved-version compatibility and the existing calculation engine.
- Operating forecasts use operating-forecast-model.ts through the shared ForecastInput validator/calculator; monthly integer-cent projections roll up into calendar quarters and remain distinct from fund capital flows — why: one preview/save engine, reconciled totals and no invented operating revenue from capital raised.
- Fund cash-flow forms/results use fund-cash-flow-model.ts through ForecastInput; growth affects opening NAV only, realized proceeds affect cash only, and negative cash shows a shortfall — why: live summaries and saved projections agree without equating NAV to available cash.

- Recurring payment schedules come only from signed-SOW frequencies and send invoices and notices, never money; missing terms require staff review.

- Commission basis is gross profit from append-only cost entries/settings; expected signed-SOW rows are computed projections, never payable; existing queue/payout amounts remain historical.
- Bookkeeping uses the shared quote engine with recorded proposed configurations and frozen line snapshots; database gates keep these draft-only until a separately approved release — why: staged pricing must never reach live signing, billing or enrollment.
- Linked quote/SOW draft terms use the canonical quote editor and service-role-only save_linked_quote_draft transaction; shared commercial fields update together, reviewed/signed records require new versions, and legacy SOW price controls cannot bypass it — why: bidirectional consistency without partial saves or approval drift.
- Public proposal SOW tabs reuse the acceptance token and exact linked client/version, projecting only client agreement sections and recorded generated lines — why: portal-free reading without directory, notes or signing authority exposure.
- Countersign timing lives in src/lib/countersign-timing.ts and feeds canInvestorFund; canCloseInvestment always forces pause so admission still needs approval — why: one funding gate, unchanged admission authority.
- Client dashboard insights use client-insights.functions.ts + pure client-dashboard-model.ts; earnings = posted 'Management fee' ledger entries + approved carry rows only, kept separate from raised capital and Harmonious costs — why: no estimated earnings or mixed figures.
- Fund changes project canonical requests and reuse review/send engines — why: no duplicate approvals.
- Offering pop-outs pin versions — why: originals only.
- Manager adds use createInvestorAndInvite + personal-link sender; imports retain createInvestor — why: saved records survive email failure, no bulk sends.

- Public security uses security-content.ts and published trust items only, and never states certification status — why: no implied controls.
