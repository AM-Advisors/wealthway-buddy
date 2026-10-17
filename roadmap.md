# Roadmap

## New fund versus migration (2026-10-17)
- [ ] Persist a fund classification and mark Erebor New fund.
- [ ] Expose classification and separate migration-only setup/readiness.
- [ ] Run focused regression checks; signed-in walkthrough requires isolated synthetic QA.

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
