# Roadmap

## Alyssa review evidence (2026-10-21)
- [ ] Connect saved signed copies and questionnaire to the fund manager's investor detail, preserving owner/fund authorization.
- [ ] Verify scoped evidence and download checks; real signed-in QA remains unavailable.

## Investor approval emails (2026-10-21)
- [x] Notify one responsible exact-fund manager after investor signing/submission; notify a separate assigned manager-signatory after document approval. Canonical completion avoids duplicate legacy notices.
- [x] Email the verified owning investor after manager funding approval with a platform link, never bank details; claim instructions are available only when the canonical funding read confirms it.
- [x] 83 focused notification, managed-send, recipient/idempotency and signing checks passed; preview build OK. No new email queue or schema changes.
- [ ] Real-user delivery and signed-in walkthrough — blocked on isolated synthetic QA; no test approval recorded or unsolicited email sent to Alyssa.

## Fund-manager subscription approval (2026-10-21)
- [x] Replace staff-only subscription admission with exact-fund manager approval; retain identity, banking and receipt reconciliation controls. Own investment requires another assigned manager.
- [x] Show Fund manager review and a manager-only approval action on investor details; update stale approval task wording and remove obsolete Operations approval button.
- [x] 126 focused authorization/readiness/progress checks passed; preview build OK.
- [ ] Signed-in approval/read-back — blocked on isolated synthetic QA access; no approval recorded on Alyssa's behalf.

## Signed tax-form details (2026-10-21)
- [x] Confirm Alyssa's W-9 is certified; connect profile and fund investor tax details to current profile-bound signed forms without exposing full identifiers or changing signatures.
- [x] Eighteen focused regression checks passed; masked tax-form evidence is read without modifying signed records or either encrypted vault.
- [ ] Signed-in read-back — blocked on isolated synthetic QA access; shared production browser testing remains prohibited.

## Investor certification publication (2026-10-21)
- [x] Confirm all five canonical certification statements are approved and effective; show the exact approved wording in Review & certify instead of headings and an unconditional pending notice. Unapproved statements cannot be certified.
- [x] 47 focused approval/effective-version, certification and investor-type checks passed; preview build OK.
- [ ] Signed-in read-back — blocked on isolated synthetic QA access; shared production browser testing remains prohibited.

## Investor submitted signed copies (2026-10-21)
- [x] Add owner-only signed document archive on investment Documents with recorded versions, dates, retained replacements and private downloads after submission.
- [x] Focused signed-copy ownership/version and document-source tests passed; preview build OK. Internal typed signatures included without treating pending external requests as completed.
- [ ] Signed-in read-back — blocked on isolated synthetic QA access.

## Investor page visibility (2026-10-21)
- [x] Restore document reading from the investor Documents tab, including completed documents; surface failed reads instead of empty information and share canonical journey context.
- [x] Correct misleading empty client-perspective wording without changing eligibility; 28 focused document/workspace checks passed. Exact existing-client association failure not reproduced.
- [ ] Signed-in read-back — blocked on isolated QA access.

## Verified investor details (2026-10-21)
- [x] Read citizenship and birthday from approved identity checks and tax-ID last four from the investing profile; align details and missing-info warnings.
- [x] Ten focused synthetic read-back checks passed; preview build OK.
- [ ] Signed-in browser read-back — blocked on isolated QA access; no real investor records changed.

## Investment amount minimum (2026-10-21)
- [x] Show the fund's minimum under the Investment amount field on the investor About You step, read from the same offering minimum the server checks the saved amount against; no line when the fund sets none.
- [x] Three focused checks passed (minimum appears directly under the amount box, absent when no minimum is set); preview build OK.
- [ ] Signed-in read-back on Alyssa's CORPS Erebor investment — blocked: her preview session stops at the second-step sign-in setup, and browser tests are not run against shared production.

## Saved-profile selection (2026-10-21)
- [x] Correct staff/investor role collision on “Use this” using record ownership, retaining profile ownership and closed-investment guards across investor self-service.
- [x] Reproduced four failures before the correction; all 53 focused synthetic checks now pass; preview build OK.
- [ ] Signed-in walkthrough — blocked: isolated QA unavailable; no shared-production browser tests or real investor changes performed.

## Saved draft reconciliation (2026-10-20)
- [x] Restore all draft-only signing, Box event tracking and Recent sign-ins layout changes using the draft reconciliation tools.
- [x] Combine Box diagnostics, retry error clearing and investing-party name fallback with main's byte-based file naming, no-version-overwrite uploads and checked signer writes.
- [x] All 31 focused signing checks passed; preview build OK. Reviewed box.server.ts, box-sign.functions.ts and document-signing.server.ts against both versions; verifier reports no dropped work and correctly leaves combined files for manual review.
- [ ] Live signing read-back — blocked on isolated synthetic QA; no live signing, messages or records authorized.

## Self Serve manager review screens (2026-10-20)
- [x] Add Fund reviews to both manager Approvals entry points: KYC/KYB status with investor detail/edit, bank evidence and verified status, document admission approvals and reconciled receipts with statement upload/transaction labels. No final KYC/bank/funding approval permissions changed.
- [x] 108 focused access/verification/document/banking checks passed; preview build OK.
- [ ] Signed-in screen walkthrough — blocked on isolated synthetic QA; shared production backend is not permitted for browser tests.
- Keep existing identity, receipt and banking final-approval permissions; no money movement or second-approval bypass.

## Website-sourced non-SPV fund templates (2026-10-20)
- [x] Verify ILPA publisher PDFs and industry drafting permission; commercial app hosting permission not established. No complete verified debt/real-estate template; no company instruments or executed agreements relabeled.
- [x] Add publisher download links with dated scope notices; canonical autofill recognizes publisher identity blanks, keeps GP separate from manager and preserves all unresolved legal terms. Enforce fund-type assignment on generation and prevent automatic activation with open blanks.
- [ ] Import website models — blocked: publisher hosting/reuse permission and fund-specific legal suitability approval not established. No third-party legal files uploaded, approved or activated.
- [x] Twenty-seven focused checks passed, including synthetic generated Word read-back, legal-name autofill, cross-type/pending/archived rejection and unresolved-term publication guard; preview build OK.
- [ ] Signed-in generation/read-back — blocked on isolated QA; no real publication/signature performed.

## Equity, debt and real estate templates (2026-10-20)
- [x] Research YC/NVCA (company-level instruments, not fund templates) and ILPA (equity-fund LPA/subscription references only); no verified official debt/real estate fund offering template. No third-party text copied or SPV documents relabeled.
- [x] Add direct PDF/Word library upload with fund-type assignments and pending approval; preserve generation/signature path. Equity/debt/real estate aliases match canonical types; failed template reads offer Retry.
- [x] Nineteen focused checks passed for type matching, staff-only upload, failed/unsupported upload, approval and activation guards.
- [ ] Populate approved equity/debt/real estate legal files — blocked: counsel-approved files not supplied; public model references do not establish suitability or approval.
- [ ] Signed-in upload → approval → fund generation/read-back — blocked on isolated synthetic QA access; no real documents activated or sent.

## Fund document approval visibility (2026-10-20)
- [x] Expose canonical offering-document approval and explicit publication on the fund Documents tab; investors see separate version approval/readiness labels without changing signatures or admission.
- [x] Run focused publication/approval checks: 78 passed, including assigned-manager approval, other-fund denial, truthful save failure, active/individual/retained version readiness; preview build OK.
- [ ] Signed-in manager approval → investor read-back — blocked on isolated synthetic QA access; no real versions activated or messages sent.

## Investor tax forms (2026-10-20)
- [x] Include shared applicable tax intake, official form preview/signing and existing-form updates in the investment Sign step; both investor entry points share the same panel and saved profile facts.
- [x] Three focused tax-step checks passed; latest preview diagnostics show build OK.
- [ ] Signed-in form completion/read-back — blocked on isolated synthetic QA; no real tax information or signatures entered.

## PPM and Operating Agreement reading (2026-10-20)
- [x] Read document now opens the active/individual uploaded PDF or Word file instead of empty metadata; Download uses the same source. Erebor OA v2 file exists; PPM uploads exist but no version is active, so show the activation requirement instead of blank content.
- [x] 35 focused checks passed, latest preview build OK; synthetic uploaded Word pages rendered at desktop and current compact viewport. No real investor sessions or document changes.
- [ ] Erebor PPM activation — manager must explicitly choose the version in Fund Documents; no version activated automatically.
- [ ] Signed-in document read-through — blocked on isolated synthetic QA; real-investor flow untested.

## Calvin subscription signing (2026-10-20)
- [x] Diagnose required-signer refusal: verified account exists but no legacy profiles row; signing now resolves its contact email from the server-verified account, without changing the investing party or assigned signers.
- [x] Run signer-identity regression checks: 27 passed, including missing legacy profile, unverified email and wrong authenticated account; preview build OK. Real signing ceremony remains untested.
- [x] Inspect Calvin's current signing blockers: $500,000 subscription exists; manager-entry provenance was ignored by the separate document admission gate. No signing or emails performed.
- [x] Treat same-fund manager entry as admission to sign; preserve explicit current-version returns and existing signer/verification controls; manager list uses the same admission facts. 32 focused tests passed; preview build OK.
- [x] Read-only eligibility check: Calvin's creator still manages Erebor, subscription document matches, requires signature, and no current-version return exists.
- [ ] Signed-in signing ceremony — blocked on isolated synthetic QA; Calvin's actual provider signing session was not created or tested.

## Thomas draft saving (2026-10-20)
- [x] Confirm published save failures at 20:08 and 20:20; Thomas has fund-manager membership and approved account verification, no stored draft. Exact thrown error remains unavailable.
- [x] Harden draft writes with scoped read-back/error checks, distinguish failed membership reads, and show unsaved/error feedback without refetch overwrites; 21 focused tests pass.
- [ ] Resolve Thomas's observed failure — blocked on the exact error from Save draft; cannot access his already-open browser form or change its session remotely.
- [ ] Confirm signed-in saving in isolated QA — blocked on isolated synthetic QA access; no production test writes or session changes.

## Current account navigation requests (2026-10-20)
- [ ] Thomas Morgan preview sign-in — approval request was interrupted; no session created.
- [x] Locate client new-fund entry: /client/funds/new; manager entry: /manager/request-fund. The My Funds screen shown has no Add action.
- [x] Add a visible Add Fund or SPV button to My Funds using the existing client-mode fund request page; permissions and payment requirements unchanged.
- [x] Fund setup: entity (legal) name defaults to the fund name; "Fund Details" and "Entity & EIN" combined into one "Fund" step in Add Fund or SPV.

## Login and session evidence (2026-10-20)
- [x] Capture authenticated sessions before policy, identity and onboarding gates; correlate safe page/error evidence by server-verified session ID, deduplicate sign-ins and preserve append-only records.
- [x] Expose session filtering and current-page evidence export in Security activity, preserving current authorization; record explicit sign-out requests in both portal shells.
- [x] Verification: 15 focused tests passed; latest preview build OK; no real-user sign-ins, messages or investment changes made.
- [ ] Signed-in UI read-back — blocked on isolated synthetic QA; shared production backend is not permitted for browser tests.

## Client and investor experience (2026-10-20)
- [x] Show loading and Retry instead of misleading empty states on client account/home and investor home/reports/signing.
- [x] Load only selected reporting sections; bound signing refreshes; target fund setup refreshes.
- [x] Align the public investor journey with the canonical four steps.
- [x] Checks: 2,958 tests passed; preview build OK; public journey verified at desktop/phone with no horizontal overflow or runtime errors.
- [ ] Authenticated client/investor walkthrough — blocked on isolated synthetic QA access; no production records changed.

## Additional reliability and performance review (2026-10-20)
- [x] Inspect additional page-loading, background-job and disconnected-page defects beyond the prior review. New source-backed defects: work-area queues filter after global first-100 pagination and suppress errors; Home can render blank on query failure; session failures appear restricted; fund auxiliary failures appear empty. Daily reminder claims are non-atomic and suppress same-day recovery; paid-card replay cannot repair failed commission enqueue; payout inserts permit duplicate recordings (live nonunique index confirmed), report recalculates instead of honoring queued amounts/recipients, and Finance-only access conflicts with Sales gate. Notifications can duplicate deliveries or finish events after ignored query failures; readiness persistence errors are ignored.
- [x] Compare source candidates with database health, query statistics and bounded runtime logs. Snapshot: DB/pool up, memory 73%, disk 22%, connections 11/60, no exhaustion alerts; no sizing recommendation supported. Query stats reset 2026-09-02 19:35 UTC (cumulative, not daily rates): 20,768 repeated oldest-run queries; live plain EXPLAIN confirms scan/sort of ~9,500 job rows. Marketing bookkeeping repeats 14 reads/tick, source candidate 14→2 without cadence change. Imports rewrite unchanged drafts/contacts/assets; 24-hour job records show 287 completed publishing and personal LinkedIn slots, 285 completed ClickUp slots (actual import hourly), 24 Drive slots; 19 older Drive/ClickUp rows still labeled running, not proof of ongoing execution. Published last-hour log shows marketing tick every five minutes; no error-keyword logs; last-24-hour DB logs repeat two known valuation enum errors. No schedule-inventory tool available. Four invoices and zero payout/queue records: commission defects are risks, not observed duplicate payouts. Further speed candidates: fund investor tab still serial live readiness; one-investor fund view rebuilds all portfolio cap tables (3+6F reads); synchronous shared email drain; repeated auth reads; broad cache invalidation; unconditional tab queries and eager chart/XLSX imports. Signed-in latency, bundle impact and sustained CPU history remain unmeasured.
- [x] Summarize priorities without changing application behavior, records, schedules or instance sizing. Recommended reviewed work: protect billing/commission recovery and notifications; fix false-empty/error states; then narrow live readiness, portfolio fan-out and marketing bookkeeping/writes, with representative isolated QA before/after checks. No additional missing-route defect established; intentional redirects retained. Findings recorded; no fixes authorized in this review.

## Current errors and page connections review (2026-10-20)
- [x] Review reported platform errors and run current unit checks: 223 files / 2,955 tests passed; latest preview build OK. Recent database logs show two invalid valuation-status errors.
- [x] Audit unknown destinations, disconnected pages and intentional redirects: reviewed destinations exist; investor reporting/admin redirects are intentional; investment Activity/Tax/statement links lose investment scope; investor dashboard/reporting/workspace suppress load errors.
- [x] Report verified defects separately from unfinished features and signed-in checks blocked by isolated QA access. Source-backed defects: portal profile creation lacks required KYC inputs; MSA/checklist first inserts lack client/manager policies (live policies verified); security-alert unregistered; banking summary drops international instructions; legacy SWIFT filtering hides beneficiary/account fields; staff grants fail manager-only read checks; Funds cache stale for 60 seconds; null catalog service keys can break snapshots (13 live null keys, eligibility not established). Billing schedule can advance after failed draft; valuation queue queries asset_valuations for unsupported returned status (live enum verified). No application code, access, money paths or business data changed.

## Broader V2.5 review
- [x] Compared investor/client and Operations source with current equivalents; recommendations: unified record history, reviewed compliance-report schedules, cap-table financing scenarios, valuation sensitivity, consolidated client reviews, and remaining Portfolio/Report Card presentation improvements. No app features or source-project records imported.

## V2.5 Portfolio and Report card
- [x] Compare V2.5 screens and workflows with current portfolio/reporting engines.
- [x] Add Portfolio plus all three Report Card types: operational, investor risk/action plan, and diligence; reuse canonical records and existing authorization/approval rules.
- [x] Adapt over canonical marks and immutable assessment records; no legacy sample grades, financial engines, or access rules imported.
- [x] Focused regression tests: 70 passed; preview compiles; public site opens with zero runtime errors.
- [ ] Authenticated Portfolio save / assessment evidence / publication / investor NDA walkthrough — blocked: isolated synthetic QA access unavailable; no production records or messages changed.
- [ ] Full V2.5 parity (multi-metric editor, visual concentration/cohort charts and share links) — deferred; current delivery provides monitoring, evidence-backed assessments, private risk questionnaires, revision history and JSON exports.

## Applicable investor-profile documents
- [x] Require applicable profile documents, reuse profile-bound uploads across investments, retain provider identity checks and canonical verification rules.
- [x] Add document Update and official tax-form Update; retain previous versions and separate investment signatures.
- [x] Focused requirement, reuse, compliance and authorization checks: 120 passed; preview compiles.
- [ ] Authenticated upload → second investment → Update walkthrough — blocked: isolated synthetic QA access unavailable; no production records changed or signatures made.

## Investor-link layout
- [x] Put required investor steps before supporting documents and status panels.
- [x] Add account setup below dedicated-link login and retain the invitation through registration.
- [x] Focused regressions: 42 checks passed (invitation paths, link controls and canonical investor journey).
- [ ] Authenticated walkthrough — blocked: isolated synthetic QA access unavailable; no accounts created or invitations sent.

## Series LLC formation and fund W-9 (2026-10-18)
- [x] Show separate formation and certificate uploads in shared setup, including Series LLC; preserve append-only versions and post-signing review.
- [x] Synchronize IRS letter evidence from both upload stores; recorded EIN plus letter or manager-signed W-9 completes the visible EIN box.
- [x] Prompt managers after staff, tax-profile, fund-file or setup-submission W-9 uploads; populate official W-9 from fund facts, confirm tax classification, assigned-manager-only signing, original/preview/hash/signature preserved.
- [x] Focused regression checks: 26 passed, including cross-store IRS evidence read-back and restricted-viewer denial; official IRS W-9 fingerprint and synthetic PDF placement verified.
- [ ] Signed-in upload → review → sign → read-back walkthrough — blocked: isolated synthetic QA access unavailable; no real signatures or test emails sent.

## Erebor test run (2026-10-18)
- [x] Run focused synthetic rule checks: 14 files, 156 tests passed, no failures.
- [x] Read-only live record check: classified New fund; all blocking setup tasks and eight operational launch conditions complete; launch confirmation outstanding, not launched, closed to onboarding. Two investor records have Person and investing Profile; neither has recorded funding. Calvin's investment amount remains $500,000; commitment amount is unset.
- [ ] Signed-in end-to-end Erebor walkthrough — blocked: isolated QA URL and synthetic staff/manager/investor sessions unavailable; no records changed or messages sent.

## Investor step email updates
- [x] Add independent immediate/daily/weekly/off controls for investors and managers in Investor Onboarding Settings; default off, changes audit-recorded.
- [x] Use canonical four-step completion after reconciliation, silent initial baseline, stable recipient/step dedupe, branded private summaries and existing five-minute job; approvals unchanged, no new email schema.
- [x] 43 focused tests passed, including saved-settings read-back, duplicate prevention and removed-manager denial; preview compiles.
- [ ] Signed-in UI and real email walkthrough — blocked: isolated synthetic QA URL/session unavailable; no production emails sent during testing.

## New fund versus migration (2026-10-17)
- [x] Persist explicit classification; Erebor New fund verified by read-back; new inserts default New fund, existing funds stay unclassified.
- [x] Shared setup marking and fund badge; migration panels/checklist hidden for new funds, new prior-subscription/payment/migration checklist records guarded. Canonical launch/KYC/money readiness unchanged.
- [x] Focused origin and banking regressions: 12 passed.
- [ ] Signed-in marking and investor-tab walkthrough — blocked: isolated synthetic QA URL/session unavailable; no production browser tests.

## Missing authenticator reset controls (2026-10-17)
- [x] Expose existing administrator-checked reset requests and second-person decisions in View account, below Session & activity
- [x] Add Security activity & resets to the People & Access administrator menu
- [x] Preview compiles; 37/38 navigation/account-status checks pass (existing investor Help-menu expectation fails, unrelated to reset controls)
- [ ] Authenticated reset walkthrough — blocked: isolated synthetic QA unavailable; no real reset requested or approved

## Make Thomas text codes live (2026-10-17)
- [x] Twilio has SMS-capable +1 682-305-2462 and $45.50 credit; sender configured; 21 focused tests passed. App SMS is freshness-only, not hosted sign-in MFA.
- [x] Publishing requested for current contact and MFA changes; deployment completion not yet verified
- [ ] Enable and verify Thomas selecting phone codes — blocked: secondary phone remains contact-only; hosted phone-MFA configuration requires user settings and enrollment, not an app-code bypass

## Thomas secondary contacts (2026-10-17)
- [x] Add secondary phone storage and staff editing; show both secondary contacts in View account
- [x] Save requested phone on Thomas's linked person with history; verified read-back, 17 tests passed, build OK
- [ ] Authenticated UI walkthrough — blocked: no isolated synthetic QA session

## Live view account (2026-10-17)
- [x] Simplify action to View account; refresh account, funds and activity every 30 seconds
- [x] Include canonical fund-manager memberships and recorded sign-out/timeout/revocation evidence without claiming online presence
- [x] Validate focused tests and preview compilation (21 tests passed; build OK)
- [ ] Authenticated account walkthrough — blocked: no isolated synthetic QA session; shared production backend cannot be used for browser tests

## Fund setup and tab navigation
- [x] Connect Fund Setup and fund tabs with fund-specific links, visible Banking and persistent navigation; preview compiles
- [ ] Authenticated click-through — blocked: isolated synthetic QA session unavailable; shared production backend cannot be used for browser tests

## Template signature sending
- [x] Remove separate Harmonious approval for generated Harmonious templates; preserve non-template review and signing controls
- [x] Validate template activation and regressions (53 tests; preview compiles)
- [ ] Signed-in review → send → sign walkthrough — blocked: no isolated synthetic QA session; shared production backend cannot be used for browser tests

## User invitation and account insights
- [x] Track successful/failed invitation sends and exact Brevo message outcomes
- [x] Add invite, login, setup filters and clickable invitation/user history
- [x] Show shared insights under client People
- [x] Validate delivery/setup model (13 tests) and clean preview compilation; Brevo read-only delivery lookup verified
- [ ] Authenticated end-to-end invitation/account walkthrough — blocked: no synthetic QA sessions; shared production backend must not be used for browser tests

## Client app and Operations separation
- [x] Complete client/staff address routing without changing permissions
- [x] Distinguish client and staff menus, top bars and sign-in presentation
- [x] Verify address redirects and sign-in screens (93 focused tests; desktop/phone browser checks)
- [ ] Authenticated client/staff click-through — blocked: no synthetic QA sessions available; shared production backend must not be used for browser tests

## Founders Fund (Digital Irish Ventures)
- [x] Setup: add multiple Google Drive links section
- [x] Read all Drive folder files and fill fund details
- [x] Create investors from Box K-1s (tax IDs encrypted, no invitations)
- [x] Load 2025 K-1s from Box and publish to each investor (MFA download)

- [x] Corps Capital funds: add Corps Cap Diversified Income Fund LLC from Drive (legal name + carry still to enter)
- [x] "Add Fund or SPV" opens one full setup engine for clients, fund managers, Operations and Account Managers
- [x] Services & Pricing: one-click standard packages (Fund, SPV, Cap table tiers)
- [x] Client View: wire My Funds, Activity, Reports, Documents, Tax, Messages to real records
- [x] One Operations Funds page + demo fund flag
- [x] Setup: save by section; fix out-of-memory save failure

## Self-serve SaaS sign-up
- [x] Picker, click-through SOW under fixed MSA, card checkout, KYB review, purchase-gated menus
- [ ] Switch existing clients to purchase-gated menus — waiting on user review of the impact report
- [ ] Automated business (KYB) check through the verification provider — today compliance reviews submitted details

## Current-client services & role sidebar (2026-10-16)
- [x] Client Services tab (set services, approve, menu switch with preview)
- [x] Migration fund payment records (Finance confirms)
- [x] Payment reminders page + daily emails
- [x] Sidebar dedupe, Payment reminders item, Super Admin extra sidebar items
- [ ] Switch individual legacy clients to purchased-services menus (per client, needs approval)

## Fund setup cleanup (2026-10-16)
- [x] Clarify setup template labels: SPV is a fund type; SPV templates are fund templates (presentation only; signed-in QA unavailable)
- [x] EIN + IRS letter box, Banking (full numbers) + bank letter box
- [x] Finished sections become summary boxes with separate Edit panel
- [ ] Investor levels — waiting on what "levels" means

## MFA ease options (2026-10-17)
- [x] Remember this device (30 days) for in-app step-ups; revoking on "sign out other sessions" and approved MFA reset; Security page card to forget devices
- [x] Emailed-code fallback (single-use 10-minute code, 3/hour, 5 attempts, audited) for tax-document downloads
- [x] Assurance floor kept: session must still be aal2; device/email proof covers freshness only (27 focused tests; build green)
- [x] Email fallback verified signed in (code requested, wrong code rejected with attempt tracking); remember-device correctly refused without a second step
- [ ] Remembered-device skip shown in the real UI — needs an aal2 session from a real authenticator sign-in (preview sessions are aal1 by design)
- [ ] Phone (SMS) codes — built and gated on a Twilio sender number; see "Twilio texts for confirmation codes" below

## Secondary email for people (2026-10-17)
- [x] persons.secondary_email column + validation (app + DB check); staff edit field in People & Access; Thomas Morgan Jr. set to morgato27@gmail.com
- [x] Copies (CC) of informational emails to the secondary address: signing requests, signing reminders, document sends, identity-check links
- [x] Security line kept: codes, invites and password resets never go to the secondary address (verified signed in; 4 unit tests; build green)

## Twilio texts for confirmation codes (2026-10-17)
- [x] Twilio connected (gateway-backed, server-side only); texted codes reuse the emailed-code engine — single-use 6-digit, 10-minute expiry, 5 attempts, 3/hour cap shared across channels, security-event audit
- [x] Text option appears only when a Twilio sender number is configured AND a mobile number is on the person's record; a texted code can never satisfy an emailed-code request (12 focused tests; build green)
- [x] Sender number and account credit — verified SMS-capable +1 682-305-2462, $45.50 balance; TWILIO_FROM_NUMBER configured
- [ ] Turn-on walkthrough in the real UI — needs the sender number above

## Erebor bank waiting label (2026-10-17)
- [x] Confirm banking_account is complete on Erebor; guided setup now consumes the same bankOnFile evidence as the manager setup loader.
- [x] Regression tests cover completion without a submission and replacement-review precedence.
- [ ] Signed-in page verification — QA-only browser policy prevents opening real-fund pages during testing.

## Manager edits before signing or funding
- [x] Allow direct investor detail updates before that investor signs or sends capital; keep shared-record, identity and post-signing protections.
- [x] Apply the same boundary to fund setup details across all investors in that fund; align Save labels.
- [x] Run focused regression tests with synthetic data: 56 passing.
- [ ] Signed-in browser walkthrough — requires synthetic QA manager session (not configured); no production testing.

## V2.5 migration (plan approved 2026-10-19)
- [x] Phase 0: checked existing — audit log already existed (/admin/audit); extended rather than duplicated
- [x] Phase 1: Record history tab (investor record changes, fund renames, client contact changes), staff-only, read-only
- [x] Phase 2: exposure charts (5 groupings + concentration), multi-measure scoring editor, expiring revocable share links with view log
- [x] Phase 3: compliance report schedules (prepared by 5-min job, second-person approval, harmonious.co recipients only)
- [ ] Signed-in walkthrough of Phases 1–3 (blocked: isolated QA access)
- [ ] Later: cap-table scenarios, valuation sensitivity, client review screen

## Reliability fixes (2026-10-20 plan)
- [x] Billing/commissions recovery (retry paid card invoices, schedule advance only on saved drafts, payout claim, Finance access, queued amounts, atomic retryable reminder run, all SOWs)
- [x] Manager alert claim, progress email checks, valuation "returned" status
- [ ] Screens that show "empty" on failed loads; ops work-area 100-item filter; banking/SWIFT display; staff grants; Funds cache and removed-investor count
- [ ] Speed: marketing sync rewrites + indexes, single-fund cap table, polling stop, narrow cache refresh, parallel readiness
- [ ] Smaller: null service keys, inputValidator warnings, portal profile identity fields, MSA/checklist first-save permissions
## Funds dashboard speed
- [x] Batch readiness reads for the Funds dashboard; failed reads are logged, not thrown (approved)

## Service level / full self-service (Oct 20)
- [x] Erebor: supplied subscription v3 active; real read/sign source with investor autofill, unsigned incorrect Calvin request cancelled; signed history retained. Missing fund-signatory title and signed-in QA remain unverified.
- [x] Service level choice in Add Fund or SPV, priced at checkout, active only once paid
- [x] Self Serve managers record IRS-issued EIN with the IRS letter
- [ ] Change service level later from fund Overview
- [ ] Self Serve managers: mark banking complete, decide KYC "needs review", approve to fund, confirm money received (identity/money paths — needs careful review)
- [ ] Show the "Record IRS-issued EIN" control to managers in Fund Setup
- [x] Manager Help Center: revised setup/EIN and new draft/service-level guidance, current prices derived from service-level source; awaits Operations article approval before client visibility
- [x] Diagnose Calvin's document errors: Box creation accepted (201); ceremony reports sign_and_send permission; signer sync has mismatched upsert/index (42P10). No resend or investor changes; provider permission check and repair remain unverified.
