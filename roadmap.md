# Roadmap

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
