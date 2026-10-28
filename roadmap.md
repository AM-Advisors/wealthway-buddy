# Roadmap

## Fund approval discoverability
- [ ] Use Fees & terms consistently and expose Approvals directly on fund pages.
- [ ] Bring existing fees, document and additional-question review controls into the Approvals area without changing authority or approving records.
- [ ] Check fictional navigation and compact layout; authenticated approval remains blocked on independently isolated QA.

## ROAS documented class fees and carry
- [x] Read subscription Section 1 and its incorporated LPA Sections 2.4(b), 10.4(c)-(d), 10.7. Saved existing draft through Alyssa's authorized canonical save: all four classes 2% annual capital-account fee, quarterly arrears; 0% Section 3.4 incentive allocation with separate B tiered allocation recorded. Preserved ranges, preferred returns and draft status, no approval/publication.
- [x] Database read-back confirms exact terms, retained ranges and no approver; 51 focused tests passed and preview build OK.
- [ ] Normal UI read-back blocked by authenticator requirement; no MFA bypass attempted.

## Fees and terms screen redesign
- [x] Simplify canonical terms editing, side-by-side class comparison, focused class editing, investor assignment and approval status without changing terms or authority.
- [x] 56 existing terms, class and authorization checks passed; actual controls rendered with fictional data and blocked record requests. Comparison, editor, defaults, search and approval locks inspected at desktop and 440px without runtime errors or page overflow. Preview build OK.
- [ ] Authenticated save/approval/assignment read-back blocked on independently isolated QA and synthetic sessions; no live terms, investors or approvals changed.

## Linked legacy investor navigation
- [x] Route legacy roster names and Open investor actions to uniquely linked same-fund canonical onboardings; use their canonical menus, retain legacy fallback and existing authorization. No live records changed.
- [x] 71 focused regressions passed and fictional linked/unlinked navigation/menu checks passed; preview build OK. No real records, sessions or emails used.
- [x] Expanded navigation edge cases and reran 149 focused link, host, investor-record, authorization and QA-safety tests: all passed. Fictional menu click-through passed without runtime errors; independent review found no routing regression. Full roster name/Open consistency across both surfaces remains unverified by a component-level browser test.
- [ ] Authenticated roster-to-record read-back remains blocked on independently isolated QA and synthetic sessions.

## ROAS 2026 and 2027 invoice correction (2026-10-28)
- [x] Correct the initial White Glove proration to $4,956.52 for Q3 2026 (August 24 through September 30, due now), without changing Q4 or future renewals; 20 focused tests passed. Invoice issuance remains blocked as below.
- [x] Update entity-specific planning terms, reported paid/due/future display and January 1 future-year visibility on both staff billing pages; invoice receipts remain separate.
- [x] Correct quote and SOW lines to the final prices (management financials annual $7,500, management annual charge $2,500, LP annual $2,500, White Glove Q3 prorated $4,956.52 added), link the SOW to ROAS Hedge LP, and send it for client review with a sign request notification for Ross at next login (2026-10-28).
- [x] Create draft invoices with the Mercury payment links: White Glove Q3+Q4 $16,956.52 (ROAS Hedge LP) and management company balance $1,500; both drafts pending SOW signature.
- [ ] Issue and send the two draft invoices after Ross or James signs the SOW and the invoices pass review; no invoices issued or recurring services activated yet.
- [x] 28 focused checks passed for concrete amounts, annual/quarterly due dates, balances and year visibility; authenticated page inspection stopped at authenticator enrollment, no bypass.

## Missing investment/application link safeguard (2026-10-27)
- [x] Remove stale-approval fallback for missing investing-person links; 73 offline tests passed and preview build OK. Missing links now block funding/compliance reads rather than imply Approved; no live records changed.
- [x] User confirmed the $50,000 investment is separate from the older signed $2,500,000 application; prepare an atomic dedicated-application action without copying approvals/signatures or reusing canceled history.
- [x] All 82 offline verification and separate-application transaction tests passed; preview build OK. Creation/link/audit rollback and retry checks passed without live writes, sessions, emails or decisions.
- [ ] Apply the dedicated link to the active investment after draft acceptance installs the authorized action; no live records changed in this draft.

## Exact investing-party verification and funding (2026-10-27)
- [x] Use explicitly application-linked person checks for legacy funding reads/actions and investor/fund compliance details, without account-based matching or weakening pending/review/declined results.
- [x] Stage atomic future person-to-active-application verification synchronization with retained audit evidence; applies on draft acceptance only, no backfill or live writes. Account identity decisions remain separate and do not approve an investing party.
- [x] All 72 offline exact-person, verification-decision and atomic synchronization regressions passed; preview build OK.
- [ ] Durable authenticated funding acceptance remains blocked on independently isolated QA and synthetic sessions; no live verification, signing or money records changed.

## Monitoring document review and cross-tab inactivity (2026-10-22)
- [x] Confirm and repair uploaded PDF/short Word review completion through shared in-page rendering, with explicit downloaded-copy confirmation on display failure; signing authority unchanged.
- [x] Share account-scoped browser activity across tabs, clear idle warnings after remote activity/Continue and guard automatic sign-out once.
- [x] Ten focused regressions and fictional browser checks passed: PDF end gating, short PDF/Word, failed rendering fallback, cross-tab Continue, preserved active session and single timeout sign-out; preview build OK, no live services/data used.
- [ ] Authenticated subscription save/read-back — blocked until independently isolated synthetic QA exists; no real investor signature or session changed.

## Staff ROAS payment tracking (2026-10-27)
- [x] Add a staff-only payments page linked from ROAS billing and invoice navigation, using canonical invoice balances and recorded payment dates.
- [x] Show annual LP and management K-1 terms separately with service-keyed invoice evidence; partial invoice receipts never imply a paid set, missing service periods remain unassigned.
- [x] Payment calculation and authorization tests plus fictional paid/partial/history/year interactions passed, no runtime errors or compact-screen page overflow; no real records changed.
- [ ] Authenticated real-record page verification remains blocked on independently isolated QA and synthetic sessions.

## ROAS billing update consolidation (2026-10-27)
- [x] Added staff-only /ops/billing/roas-update as the one read-only place for the ROAS draft quote terms, recorded invoice balances, annual K-1 sets, conditional filing-fee range and next steps; linked from Operations billing and searchable navigation.
- [ ] Authenticated page read-back remains blocked on independently isolated QA and synthetic sessions; no quote, invoice, filing, payment or approval changed.

## ROAS annual K-1 and filing fees (2026-10-27)
- [x] Added separate LP and management annual K-1 sets at $2,500 each, first bill December 31, 2026, to the existing ROAS draft quote through Alyssa's authenticated save; saved rows read back. No duplicate quote, issuance, signing or activation.
- [x] Prepared conditional fee review in docs/roas-filing-fee-review.md using recorded states and official sources: $160 Harmonious fee, state subtotal $950/$1,850 plus Texas up to $500, excluding unverified processing/late charges. No notices, payments or close approvals performed.
- [ ] Final filing total/payment preparation blocked on actual first-sale dates, aggregate offering amount, investing-party jurisdictions and any externally filed notices; $635,000 of commitments and zero recorded funding do not establish those facts.
- [x] Twenty-one annual amount/due-date/cadence tests passed; preview build OK. Authenticated quote rows read back; normal Sales page remains at Checking your access, so UI acceptance unverified. Invoice/SOW issuance retains quote approval; no filings or payments performed.

## ROAS corrected billing and quarterly terms (2026-10-27)
- [x] Voided the incorrect $19,000 current invoice through Alyssa's authenticated canonical billing function; read back void status/reason, original history retained.
- [ ] Replacement paid invoices/LP partial receipt: need confirmed payment dates and source attribution, plus an authorized receipt-correction path; existing $11,500 historical receipt event cannot be deleted or silently reused. Setup paid invoice remains unchanged.
- [x] Updated existing ROAS draft quote and proposed White Glove service through Alyssa's authenticated saves: management financials start Q4, quarter-end financial terms, quarter-start White Glove, August 24 partial period $4,956.52; no approval, send or activation.
- [ ] Invoice preparation and linked SOW: canonical agreement generation requires quote approval; no reason-logged self-approval supplied. Current invoice creation requires contracted services and lacks explicit calendar-quarter due/proration inputs. LP annual quote service mapping also remains unresolved; no guessed mapping or billing bypass.
- [x] Twenty-two concrete amount/proration/due-date and balance/cadence checks passed; saved quote/service read-back verified, no automatic money movement or synthetic live QA.

## Full Self Serve journey verification (2026-10-27)
- [x] Rechecked current backend: production, no development instance. Reviewed E2E origin/evidence absent; existing preflight refused before browser navigation or writes. Six safety checks and 65 focused fictional setup/invitation/document checks passed.
- [ ] Create fund → invite investor → upload document → independently approve → sign → read completed copy on fund page, blocked on independently isolated QA, verified storage/auth/runtime binding and synthetic sessions. No live fund, upload, email or signature was created; offline checks do not establish full journey success.

## Self Serve fund page (2026-10-27)
- [x] Replace the stacked manager fund overview with URL-selected setup, investors/invitations, documents, onboarding link, team and activity areas; mount selected tools only and retain their existing authorized saves and review controls.
- [x] Remove staff-area links from client settings, add client portal shortcuts and correct client document audience; fictional navigation and review blocking checked, 57 focused safeguards passed.
- [ ] Durable authenticated setup, launch and email delivery remain blocked by independently isolated QA and synthetic sessions. Signatory confirmation, bank verification, identity, financial reviews and legacy generators keep existing staff safeguards.

## Self Serve document generation (2026-10-27)
- [x] Allow exact-fund Self Serve managers to generate approved-template drafts; independent exact-version approval/return and database gates precede existing activation/signing. Legacy starter/standard-form tools remain staff-only.
- [x] Fictional generation, review and availability controls checked with blocked self-approval, no runtime errors and no mobile overflow; permission/version/database regressions passed.
- [ ] Durable authenticated generation and signature delivery remain blocked on independently isolated QA and synthetic sessions; no live documents or signing emails changed.

## Cross-source contact matching (2026-10-27)
- [x] Match imported normalized emails within the same owner using an atomic source-link transaction; other-owner matches retain explicit review. Contact/company views group entitled same-scope matches and share original history; no login/person merges, historical deletions or access expansion.
- [x] Thirteen fictional model/transaction checks pass; company contact → activity → email click-through inspected at desktop and 440px without runtime errors or overflow. Matching function confirmed installed; no live imports run or existing contacts rewritten.
- [ ] Durable authenticated import/read-back requires isolated QA; live release requires explicit publishing approval.

## Contracted bookkeeping, posting and reviewed reporting (2026-10-27)
- [x] Rechecked current backend metadata: shared production only, no development instance. Reviewed QA evidence and QA origin are absent; 84 offline bookkeeping, fee and safety checks pass. No financial fixtures, enrollment, invoice issuance, posting, pricing publication or real records changed.
- [ ] Establish independently isolated database/auth/storage, actual frontend/server binding, no production data/credentials and inert outbound integrations/jobs in Harmonious QA; security validation and synthetic sessions must pass before implementation resumes.
- [ ] Build exact-entity executed-contract enrollment, canonical idempotent fee journal preparation/posting and independently reviewed report release in validated QA; blocked on the preceding isolation/security gate.
- [ ] Run durable fictional quote → executed contract → enrollment → invoice → reviewed journal posting → released report read-back with separate synthetic actors; blocked on isolated QA and implementation. Proposed pricing and production activation retain separate release approval.

## Complete request-to-task handoff loop (2026-10-27)
- [x] Added explicit Sales-to-Operations transfer with receiving Operations owner and deadline, atomic linked-task status, optimistic saves, and fund Requests tab task progress. Internal task details remain staff-only; client request status/deadline remain visible. Installed progress trigger confirmed; no existing records backfilled.
- [x] Fictional transaction and assignment → transfer → completion click-through checks pass; desktop and 440px layout inspected without runtime errors or overflow.
- [ ] Durable authenticated verification remains blocked by independently isolated QA evidence and synthetic sessions; fictional checks do not establish live delivery or saved-record acceptance.

## Fund request and task synchronization (2026-10-27)
- [x] Primary linked task owner, team and due date synchronize atomically in both directions; review tasks, approvals and request status remain unchanged. Installed triggers confirmed through the database catalog; no existing assignments or records backfilled.
- [x] Added authorized searchable receiving-owner control on requests and receiving-team control on tasks, with linked-screen refresh. Fifty-one focused fictional request/handoff tests pass, including ten synchronization transaction checks; preview build OK.
- [ ] Durable authenticated request → task → request click-through requires independently isolated QA evidence and synthetic sessions; not verified against the shared live backend.

## Sales to Operations handoff (2026-10-27)
- [x] Reuse canonical staff tasks for a quote-linked fund handoff, with receiving Operations owner, due date, acknowledgment and status on the fund page. Receiving-owner transitions and task events save atomically; existing signed quotes show Needs assignment without page-load writes.
- [x] Seventeen focused handoff/commission tests pass; fictional assignment → acknowledgment → completion inspected on desktop and 440px screens, no runtime errors or overflow. Preview build OK; no live assignments, sends or money changes.
- [ ] Durable authenticated save/read-back awaits independently isolated QA evidence and synthetic sessions.

## Connected commercial teams (2026-10-27)
- [x] Unify promotional email suppression and authorized opt-in audiences across Marketing, CRM campaigns, Sales outreach and rep-confirmed flows; transactional notices remain separate and prior opt-outs cannot be silently cleared.
- [x] Tighten contact/flow history visibility and align menus with existing server authority, without new role grants.
- [x] Connect atomic website qualification, explicit imported-contact match reviews, Sales assignment and active follow-up ownership; preserve source provenance and never auto-merge identities.
- [x] Synchronize CRM opportunity stages and Sales follow-up hooks; manual stages remain independent of signed contract and payment evidence.
- [x] Connect existing scoped Marketing, Sales, Account Management, Finance, fee, commission, forecast and payment-review surfaces; recorded partial receipts and remaining balances remain separate from projections.
- [x] Add focused fictional regression checks and desktop/compact click-through coverage, without live sends, contracts, posting, transfers or publishing.
- [ ] Durable authenticated acceptance and live release require independently isolated QA evidence/synthetic sessions and explicit publishing approval.

## Finish remaining work (2026-10-27)
- [x] Replaced the ten-second animation with an 85.8-second H.264/AAC narrated walkthrough, captions and illustrative fictional screens; shared guide mounted on fund join and fictional QA pages. All seven scenes visually inspected and app media URL returns the full file. AI narration, not a recorded person; no actual investor screen recordings.
- [ ] External browser playback and investor-link live release: sandbox Chromium lacks H.264 support, so actual playback is unverified; publishing requires explicit approval. Durable investor onboarding still requires isolated synthetic QA.
- [x] Added read-only fee-entry previews with exact-client books, explicit expense/payable mappings, open-period and duplicate-source blockers. No draft writes or posting; durable preparation remains blocked by isolated financial QA and approved accounting release.
- [x] Extended fictional click-through to connected quote, agreement, partial-payment invoice, reporting periods and the real fee-preview control. 3,867 tests pass; desktop fee dialog and 440px billing flow checked with no runtime errors. This is fictional evidence, not authenticated production verification.
- [ ] Hourly contact sync live release: requires explicit publishing approval; do not change the shared marketing scheduler cadence.
- [ ] LaaSy Class B approval: requires an authorized reviewer or a permanently recorded Super Admin self-approval reason.
- [ ] ROAS White Glove execution and bookkeeping activation: preserve commercial approval and release gates; no automatic live activation.

## Investor onboarding link during fund launch (2026-10-26)
- [x] Reuse the canonical onboarding-link engine before marking a ready fund launched; preserve approvals and exact-fund authorization, reuse active links, refuse silently enabling disabled links, and retain ready state on link-creation failure. No real fund/link records changed.
- [x] Forty-four fictional launch/link regression checks pass; launch returns and records the canonical join URL, with existing links readable through the manager's link reader.
- [ ] Authenticated launch → Copy link → investor start and durable concurrency checks, blocked on independently isolated QA evidence and synthetic sessions; no production launch or emails used for testing.

## Direct invoice and fee links (2026-10-26)
- [x] Client invoices page: each invoice has a Copy direct link button (/client/invoices?invoice=<id>) that opens, sorts and scrolls to that invoice; fund managers use it to jump straight to the invoice.
- [x] Staff invoice board: Copy link for fund manager button copies the client-facing direct link for sharing.
- [x] Accounting page: /ops/accounting?tab=fees&invoice=<id> opens the Invoice fees tab scoped to one invoice, with per-fee Copy link and a Show all fees reset. Twelve focused fee/balance tests pass.
- [ ] Authenticated click-through of the deep links, blocked on independently isolated synthetic QA sessions.

## Fund and company fee accounting links (2026-10-26)
- [x] Added same-client fund/legal-company assignment per issued fee using append-only billing events, with fixed recorded fund ownership and no invoice-term changes. Accounting Invoice fees tab reads those same sources and any existing source-linked journal status; no duplicate ledger entries are created.
- [x] Sixty-six focused offline fee-ownership, invoice relationship and staged-bookkeeping rules pass; preview build OK. No live assignments, financial records, activation, emails or payments changed.
- [ ] Actual fee-to-journal draft/posting and company quote propagation: deferred behind existing entity-accounting/access design and isolated financial QA release boundary, not represented as posted books.
- [ ] Authenticated assignment and accounting read-back: blocked on independently isolated synthetic evidence and sessions.

## Connected client quotes, agreements and invoice due dates (2026-10-26)
- [x] Client invoices open same-client original quote/proposal readers and entitled SOWs; SOWs list exact related issued invoices with direct invoice selection/payment links. Original versions/read fields are scoped; no new signing tokens or access grants.
- [x] Signed proposals show exact acceptance-linked invoice number/status, paid/remaining balances, recorded due dates and direct invoice link. Quote valid-until is separate; absent dates remain Not set. No issued terms, due dates, signatures, emails or money changed.
- [x] Thirty-five focused relationship, date, balance, acceptance and client-section tests pass; preview build OK. Offline fictional deadline/control display inspected on desktop and 440px screen without overflow/runtime errors, not a real authenticated page walkthrough.
- [ ] Authenticated quote → invoice → SOW → payment read-back, blocked on independently isolated synthetic QA evidence/sessions; no real signing/payment or production client testing.

## ROAS billing frequency and invoice views (2026-10-26)
- [x] Added monthly, quarterly, and annual proposed engagement selectors with consistent negotiated annual value; ROAS White Glove calculates $4,000/$12,000/$48,000. ROAS-specific quote monthly selection uses annual-equivalent conversion without changing global rates. Contracted cadence changes require a new agreement; no live service, quote or invoice changes.
- [x] Added shared client/Operations monthly, quarterly, and annual billed/paid/remaining views with invoice selection; issue dates, recorded receipt dates and due dates remain separate. Existing payment plans and issued/receipt history unchanged; staff outstanding total uses remaining balances.
- [x] Fifty-two focused offline billing, balance, period, planning and linked-SOW checks pass; preview build OK.
- [ ] Authenticated save/read-back and client screen walkthrough, blocked on independently isolated synthetic QA evidence/sessions. Commercial approval, signing and activation remain pending; no real account used for testing.

## ROAS partial payments and White Glove (2026-10-26)
- [x] Client invoices/downloads show paid and remaining; outstanding total and dashboard due amounts use remaining balances. Authorized readers project receipt snapshots only; issued amounts/notes unchanged. Partial-payment card checkout blocked to prevent full-amount double collection.
- [x] Recorded the previously confirmed $11,500 INV-5 receipt as an append-only structured total; read back $19,000 original, $11,500 paid, $7,500 remaining. No paid status, invoice, commission or money movement triggered.
- [x] Added ROAS-specific proposed Fund Administration White Glove at $12,000 quarterly, $48,000 annualized, through the existing save validation/authorization with custom-price reason. No effective date, activation, invoice or email; agreement/approval remain required.
- [x] Thirteen focused balance/migrated-authority/custom-pricing checks passed; preview build OK and actual saved balances/proposed service read back.
- [ ] Authenticated client UI read-back, blocked on independently isolated synthetic QA; no production client session used for testing.

## Corps LaaSy subscription agreement and PPM (2026-10-26)
- [x] Added both approved SPV templates through authorized staff generation and read back stored Word copies with Corps LaaSy's name and canonical terms. Subscription v2 removes two inherited red font settings without changing wording and retains investor-first signing configuration. PPM v1 and subscription v2 remain inactive review drafts; Operating Agreement v2 and all signature/history records unchanged. No email sent.
- [x] Arbitration recorded on the fund as Dallas, Texas (2026-10-26).
- [x] Address confirmed (Corps only); regenerated inactive drafts PPM v2 and subscription v3 with Southlake address and Dallas arbitration, black text, nothing sent or activated.
- [x] PPM v3 fills Thomas's phone/email. Autofill now names empty {{}} blanks from their label (Tel/e-mail) and reports any it can't name, so blanks are never silently missed.

## Clickable account identity review (2026-10-24)
- [x] Open exact-check detailed evidence from the account identity queue using the shared review panel, recorded warnings, on-demand photos and existing decisions/match clearances; no authority or verification changes.
- [x] 47 existing identity/match checks passed; fictional click-through verified exact-check details, expected-name comparison, masked ID, breach details, photo control, absent evidence and clean session switching on desktop/compact screens without runtime errors; preview build OK.
- [ ] Authenticated evidence/photo/decision read-back, blocked on independently isolated synthetic QA; no real decisions or test emails.

## Enhanced public security page (2026-10-23)
- [x] Clarify encryption versus independent assurance; improve overview, section navigation, retention, security reporting and investor FAQs using existing published evidence only.
- [x] Public desktop/mobile page, expandable SSL answer and legal contact file verified; no overflow or runtime errors. Existing 27 security tests pass; preview build OK. No financial, authentication, publication or assurance records changed. Publishing remains a separate user action.

## Manager-added investor invitations (2026-10-23)
- [x] Interactive manager addition uses the saved investment's personal invitation and reports sending failure without losing the saved record; imports and historical rows unchanged.
- [x] All 56 fictional investor-entry/invitation checks pass; preview build OK. No live additions or test emails sent.
- [ ] Authenticated add → email → claim read-back — blocked on independently isolated synthetic QA; no live investor additions or test emails.

## Erebor black-text correction (2026-10-23)
- [x] Replaced 92 red PDF color operators and matching Word red font with black in separate Thomas v10 correction; all extracted wording identical and zero red spans. Registered unsigned draft 281b667a-502d-4774-90a6-c467cd8ecba3 through authorized preparation, no send/signature/activation.
- [x] Inspected all 37 pages and signature-page close-up; black text visible without new clipping or layout changes. Original blank signature underline wrap retained. Main remains exact Thomas v9 source with actual signature separately recorded.
- [ ] Replace main with black-text version — requires Thomas's actual new signature; no signature transferred or executed source altered.

## Signed replacement publication (2026-10-23)
- [x] Register exact Thomas OA PDF as offering version 7 through Alyssa's authorized designation; main now Erebor_Operating_Agreement_Thomas_v9.pdf, approved/confirmed/new_only, Thomas signature unchanged, all 7 versions retained, resign=0.
- [x] Automatically promote explicitly staff-designated approved fund-signatory-only OA replacements after all required file signatures complete, with stale-version protection and atomic retained history. Added staff Use as replacement control; publication required for that new control.
- [x] 39 fictional promotion/model/title checks and 31 promotion/activation/reader/title checks passed; main and signature read back from live records. No signatures or emails sent for testing.
- [ ] Future signing and new-control authenticated walkthrough — blocked on independently isolated synthetic QA; live activation verified through authorized save/read-back, not a synthetic signing ceremony.

## Client MSA signature save (2026-10-23)
- [x] Reproduce first-signature RLS failure offline and repair using authenticated atomic ceremony with exact membership, designated signer, current-version, retry and rollback checks. No real signatures submitted; staff-owned sibling creation paths use existing privileged authorized saves and are unchanged.
- [ ] Authenticated real-flow read-back — blocked on independently isolated synthetic QA; never sign a real agreement for testing.

## Thomas prepared Erebor copies (2026-10-23)
- [x] Prepare named OA/PPM copies with Manager title confirmed by Alyssa October 23, 2026 and confirmed email/phone; preserve 6% one-time management fee and 20% carry, actual signature lines and signed history. Saved OA Thomas v8 and PPM Thomas v10 Word/PDF copies; verified title/contact text and cover/signature page layout. No send, platform activation or record-title update performed.
- [x] Confirm organizer/adviser signature capacity — Alyssa confirmed Thomas Morgan Jr., Manager, may sign for Corps Capital BDC LLC in all three roles October 23.
- [x] Add fund Documents signing tracker over fund_file_signatures and append-only manual audit entries; manual reported signing never changes execution. Twelve model/title tests pass and preview build OK. Tracker UI deployment still requires publishing.
- [x] Complete OA Thomas v9 all-role blocks, correct adviser entity description, inspect 37 pages, save copies, register exact private PDF plus matching text as fund file 5585a2cc-6678-44bf-b2bf-d443de32a571. Authorized canonical title/capacity save succeeded; previous copies and signed history retained.
- [x] Email Thomas via existing signatory ceremony; send returned success and signature 6130dd75-eaa9-4a34-bcaf-c37deae67bd3 read back sent at 2026-10-23T00:27:05Z with no signed_at. Managed email logs show no event yet; inbox delivery unverified. No signature submitted.
- [ ] Verify tracker UI and Thomas exact-PDF view through normal account screens — current requester screen stops at account identity gate; no gate bypass or real signing for testing. Existing published page reads registered agreement text; new original-PDF viewer and tracker require publishing.

## Erebor document formatting correction (2026-10-22)
- [x] Follow-up white-text clipping: reproduced in PPM General Notices; corrected textbox direction and excessive internal spacing across Table of Contents, General Notices and Exhibit A. Inspected all 60 PPM pages and close-up headings; exact wording unchanged. Saved PPM file v8 and activated platform v7 new_only; read back approved active version, resign=0. Operating Agreement unchanged; no email sent.
- [x] Restore missing PPM cover title and add matching navy/white Operating Agreement cover heading; preserve all existing wording, 6% one-time fee, 20% carry, and signed history. Validate Word packages and inspect every one of 97 PDF pages.
- [x] Save versioned Word/PDF copies in Files and existing Erebor collection (new members pending indexing); authorized new-only activation of both platform version 6 replacements, no resign requests or emails. Read back active versions and approved rollout status.

## Dedicated client-invoice ACH and wire spot (2026-10-22)
- [x] Add executive-only Sales shortcut to the existing invoice payment-instructions page; label CEO/CRO and client-invoice-only scope, separate ACH/wire routing labels, history and failed-read retry. Existing authorization and approval engine unchanged.
- [x] 55 payment authority, approval and navigation tests passed; preview build OK. No banking values, approvals or money records changed.
- [ ] Signed-in settings walkthrough — blocked on independently isolated synthetic QA; no live banking edits performed for testing.

## Erebor one-time fee and carry replacements (2026-10-22)
- [x] Confirm active approved terms: 6% of committed capital and 20% carry. Prepare new unsigned OA review revision v4 and PPM review revision v5 with explicit one-time/nonrecurring fee and 20% carry; inspect all 99 rendered pages and assert PDF economics.
- [x] User-requested live draft registration through Alyssa's own authorized upload action: OA platform version 3 and PPM platform version 4, both uploaded_review_required and inactive; existing active OA v2/PPM v3 and all signatures unchanged. Read back saved versions.
- [x] User confirmed organizer Corps Capital BDC LLC and PPM contact Thomas email / 214-452-2300; restored original template presentation without added draft labels/review appendix. All 97 rendered pages inspected; economics/contact/no unresolved placeholders checked. Through authorized saves recorded Managing Partner title, confirmed OA signatory blocks and activated clean OA/PPM platform v5 with new_only, resign=0; saved approval/scope/title read back. Old sent/signed versions retained. This is user-authorized publication, not independent legal certification.
- [ ] Send to Thomas for actual signature — not sent; awaits explicit send after user views main copies. Subscription Agreement reconciliation remains needed before sending the complete new-investor packet.

## Offering document pop-out (2026-10-22)
- [x] Add View to offering document rows and individual versions; pop-out opens the exact selected original PDF/Word using existing authorized version links, with download and error recovery.
- [ ] Authenticated exact-fund file viewing — blocked on independently isolated synthetic QA; no production documents changed.

## Fund requests, approvals and alerts (2026-10-22)
- [x] Expose canonical pending fees, side letters and saved-edit review links beside client approvals; reuse existing decisions, including reason-logged Super Admin side-letter self-review.
- [x] Add fund-scoped pending request summary and recent status updates; emit manager email/bell and existing Operations alerts for fee/side-letter/saved-edit requests, plus operational request creation/progress. No new approval store or automatic approval.
- [x] 23 focused fictional model/alert/side-letter/phase-3 checks passed; preview build OK. No real fund terms, approvals or alerts changed during testing.
- [ ] Authenticated fund request → review → decision/read-back and actual alert delivery — blocked on independently isolated synthetic QA; shared production browser testing not permitted.

## Default terms and separate investor exceptions (2026-10-22)
- [x] Keep fund defaults distinct from class overrides; default-term investors need no exception class and no missing-class warning.
- [x] Reuse approved-class assignment and separately linked side-letter proposals from fund setup and investor details; existing authorization/approval preserved, signed/funded defaults also protected against class reassignment.
- [x] Fictional default/class/side-letter checks passed; preview build OK; no live fund terms, classes, side letters, signatures or emails changed.
- [ ] Authenticated association save/read-back — blocked on independently isolated synthetic QA.

## Multi-item side letters (2026-10-22)
- [x] Combine selected management-fee, carry, minimum-investment and information-rights items into one staff-generated draft; each original item button opens the multi-item form with that item selected. Existing signing and historical documents unchanged.
- [x] 31 fictional generation/model/staff-permission checks passed; preview build OK. No live documents, signatures or emails changed.
- [ ] Authenticated draft save/read-back and signing — blocked on independently isolated synthetic QA.

## Correct documents and staff-only generation (2026-10-22)
- [x] Restrict template use/bulk generation, starter drafts and standard forms server-side to their existing authorized Harmonious staff allowlists; hide manager generation controls, retain review/sign/upload rights. 49 fictional permission/autofill/version/evidence checks passed; preview build OK. Signed-in generation controls remain unverified pending isolated synthetic QA.
- [x] Prepare standalone unexecuted Erebor review drafts (OA v3, PPM v4, subscription v4) in Files/collection: recorded identity/title and terms filled, OA fixed fee/arbitration clauses proposed for legal review, no signatures reused. All 116 rendered pages inspected after removing inherited blank breaks and repeated draft labels. Draft files are not recorded platform versions or in use.
- [ ] Record confirmed title through authorized save, approve legal correction wording (including fee timing/payee/no duplicate advisory charge), resolve PPM empty contact placeholders, upload/activate replacements and archive superseded versions — blocked on legal approval and authorized version rollout; original signed files and current active versions remain unchanged. No live records, signatures or emails changed.

## Operating Agreement signatory title and signed corrections (2026-10-22)
- [x] New template Operating Agreement signing requests require the exact recorded signatory, a recorded title and resolved template fields; freeze the title in the signature packet. 31 fictional title/autofill/version regression checks passed; preview build OK. Erebor's offering and active primary signatory both have no recorded title. No signed documents or live records changed.
- [ ] Authenticated corrected-generation/send/read-back — blocked until independently isolated synthetic QA; offline checks do not verify a real signing ceremony.
- [x] User confirmed Thomas Morgan's exact Erebor title: Managing Partner; saved as standing requirement, not written over live records or signed copies.
- [ ] Record the confirmed title through the authorized signatory save and correct Erebor agreements through reviewed replacement versions/new signatures — requires an authorized save and corrected legal wording/rollout for the existing fee/arbitration conflicts; originals must remain unchanged.

## Corps Erebor template term mismatch (2026-10-22)
- [x] Compare canonical facts and supplied source templates: recorded management fee 6% of committed capital, carry 15%, arbitration Dallas/Texas; source OA and attached advisory agreement hardcode no management fee and Dover/Delaware, while PPM uses percent-suffixed blanks. Active versions are PPM v1, OA v2, subscription v3; PPM latest v3 points to the old v1 file, not regenerated text.
- [x] Correct percentage duplication, active-fee-only reads, missing fee basis/hurdle/minimum aliases and failed-read handling; flag fixed no-fee/arbitration conflicts to prevent automatic activation of newly generated conflicting drafts. Retain minimum-versus-investor-amount distinction confirmed in actual subscription template. No live documents, signing, approvals or publication changed.
- [x] 31 focused fictional regression checks passed; uploaded PPM/OA/subscription templates exercised with fictional fund facts, saved Word bytes read back and both OA conflicts detected.
- [ ] Replace conflicting existing legal clauses and review/activate corrected versions — requires authorized legal wording review and explicit version rollout; signed history cannot be rewritten. Exact stored-file contents and authenticated generation/read-back remain unverified without independently isolated synthetic QA.

## Quote quarterly and annual calculation (2026-10-22)
- [x] Share per-billing-period baseline calculations between quote editor and authorized saves; use recorded quarterly rates where available, preserve true discount approvals and linked SOW billing terms. Recurring service selections convert amounts and show their chosen period rather than a locked annual label.
- [x] 82 focused regression checks passed; preview build OK. No live quote/signing/payment actions were exercised.
- [ ] Authenticated quote save/read-back — blocked until independently isolated synthetic QA; no live quotes, agreements, invoices or payments changed.

## Dev Test 1 interactive client demo (2026-10-22)
- [x] Read-only review: fund and owning client are marked demo/test; fund is not launched, has no investors, two real-account managers, incomplete setup details and no recorded banking path. Demo marking is display-only, not isolation.
- [ ] Finish fictional fund details, synthetic manager/investor setup and interactive invitation/signing walkthrough — blocked until independently isolated backend/frontend binding and synthetic sessions pass existing preflight. Current Dev Test 1 shares production records; no fund facts, access, documents, verification, emails or money records changed.

## Help Center guides and screen recordings (2026-10-22)
- [x] Updated outdated guides and added fund setup, investor invitation/onboarding, document access, countersign, Harmonized SPV and fund-of-funds guidance; changed client articles need approval of their new versions.
- [x] 27 Help Center checks passed; preview build OK. Signed-in Help Center viewing not checked.
- [ ] Create actual screen recordings for investor invitations, fund setup and investor onboarding — blocked until independently isolated synthetic QA supports recording real steps without production records or simulated signatures.

## Operations Slack links and verification confirmation (2026-10-22)
- [x] Locate the reported client PortalGate error; Operations Slack links now land directly on ops.harmonious.co without an app-domain hop. Missing owner remains informational; no ownership or permission changes. Exact live access-check failure is not reproduced.
- [x] Route KYC/KYB/AML confirmation-required alerts through the existing sender from account/provider checks, business submissions and prior-check reruns; include canonical account/business review rows in the existing alert sweep. Processing-only checks do not alert; restricted details stay private.
- [x] 167 fictional regression checks passed; preview build OK. No real verification decisions, ownership, messages or funds changed during testing.
- [ ] Fund A authenticated click-through and live Slack delivery — blocked until independently isolated synthetic QA; old Slack messages retain their original links.

## Signing while AML is pending (2026-10-22)
- [x] Allow approved investing-party identity + explicit pending AML to proceed to signing in both investor experiences; ceremony entry points re-read canonical investment verification and blocking exceptions. Failed/review AML and pending identity remain blocked.
- [x] Keep wire instructions, funding and final admission behind fully approved verification, including legacy funding reads/actions; 183 fictional regression checks passed and preview build OK. No real identity, signature, funding or email records changed.
- [ ] Authenticated investor signing/read-back — blocked until independently isolated synthetic QA exists.

## Quote section switches (2026-10-22)
- [x] Give every part of a quote its own on/off switch in the quote editor (Summary, Your needs, Our approach, Services and pricing, Pricing, Timeline, Next steps, Notes, About Harmonious): switching one off hides it from the client page and keeps its wording recorded, nothing is deleted. Only Pricing and Notes start on, so existing quote pages look the same.
- [x] 10 focused model checks passed (a switched-off part keeps its wording, defaults, unknown parts dropped, client projection, notes and pricing switches, ordering); preview build OK. No real quote, SOW, invoice or email changed.
- [ ] Signed-in quote edit → save → client read-back — blocked until independently isolated synthetic QA exists; the preview runs on live records.


## Agreement panel scrolling (2026-10-22)
- [x] Let the Master Service Agreement, Privacy Policy and Terms & Conditions panels scroll through their full text on review links, the signed-in signing page, the sign-off screen and both policy gates; the agreement wording editor is now tall and resizable.
- [x] Preview build OK. On a read-only review link for a fictional test recipient, the Privacy Policy and Terms & Conditions panels scrolled a 1,720px agreement to its last line (606px visible); nothing was signed, sent or recorded.
- [ ] Master Service Agreement panel and signed-in surfaces (signing page, sign-off screen, policy gates, wording editor) — the agreement panel could not be opened on a live link because every ready client has already accepted the current version, and the signed-in screens need a session that isolated QA must supply.

## Client proposal SOW tab (2026-10-22)
- [x] Add a read-only Statement of Work tab to the public proposal review/sign page using its existing recipient/version token, recorded SOW sections and generated lines only; no portal login or signing changes.
- [x] 33 offline projection, version, signing and linked-term regression tests passed; preview build OK.
- [ ] Real client-link tab/read-back verification — blocked until independently isolated QA is available; no live client records or emails used for testing.

## Linked quote and SOW edits (2026-10-22)
- [x] Synchronize linked draft services, prices, billing terms, title and fund through one transactional save; SOW-side uses the canonical quote form, legacy price/section controls cannot bypass it. Reviewed quotes get a new linked SOW draft; prior agreements remain intact.
- [x] 84 fictional synchronization and quote/bookkeeping/approval regression tests passed; preview build OK. No real quotes, SOWs, invoices, payments or emails changed in testing.
- [ ] Authenticated edit/save/read-back and database transaction/concurrency verification — blocked until independently isolated QA exists.

## Bookkeeping Phase 2 isolation and security (2026-10-22)
- [x] Inspect current metadata (production-only; three drafts not isolated), available commands and the existing Harmonious QA source snapshot; six offline safety tests pass and browser preflight blocks before queries/navigation. Source contains QA switches but cannot prove deployed isolation.
- [ ] Verify candidate QA independent database/auth/storage, actual frontend/server binding, credential absence, inert jobs and blocked production integrations — requires that project's own context and complete runtime evidence before accounts or financial fixtures.
- [ ] Provision requested fictional entity/user fixtures and validate quote guards, durable read-back, recovery, tenant denial and revocation — blocked until every isolation requirement is independently verified in the QA project's own context.
- [x] Prepare a proposed exact-entity accounting/document/reconciliation/report access matrix using existing authorization and ledger/reporting engines; not implemented or validated. Dedicated QA projects may use a production instance label, requiring separately reviewed QA-local harness compatibility, never a production bypass.
- [ ] Validate that access model and resume enrollment and simulated billing — blocked on all isolation evidence and successful synthetic security checks.
- [x] Deliver docs/bookkeeping-phase2-isolation-review.md with Yes/No results, candidate source findings, exact manual setup, QA-chat handoff and remaining blockers; production code/settings/data/access restrictions unchanged.

## Bookkeeping continuation safety review (2026-10-22)
- [x] Review uploaded continuation brief and verify current five-tier/three-reconciliation pricing, server recalculation, frozen proposed snapshots and existing release gates from source.
- [x] Re-run 76 fictional offline bookkeeping, Sales, invoice, acceptance and QA-safety checks: all pass. Browser preflight blocks before backend queries or navigation without reviewed isolation evidence and an explicit QA origin.
- [x] Provide continuation results, unchanged-production boundary, remaining risks and activation prerequisites in docs/bookkeeping-continuation-results.md and the user-facing report.
- [ ] Enrollment infrastructure, entity-scoped reconciliation/review, billing/amendments and client/portfolio views — stopped at the requested safe boundary: independent fictional QA, served frontend/server binding and legal-entity access safeguards are not established. No schema, live services, prices, signed agreements, invoices, payments or client financial records changed.
- [ ] Full quote-to-enrollment, upgrade/downgrade, direct database/RLS, documentation approval and report-release verification — requires independently isolated synthetic QA with reviewed access design and existing accounting audit fixes; offline tests are not production-readiness evidence.

## Bookkeeping service integration brief (2026-10-22)
- [x] Review existing pricing, quote/SOW, billing, accounting and entity-access engines; prepare a phased plan including standalone handoff, first-invoice deduplication and service-critical accounting release gates.
- [x] Internal proposed configuration editor and guided bookkeeping quote inputs; server-calculated pricing, frozen versioned draft lines and proposed SOW scope; database gates prevent approval, sending and live billing. Existing prices/contracts unchanged.
- [x] 87 offline checks passed (48 bookkeeping rules plus Sales, invoice, acceptance and QA regressions); fictional real-form frequency/custom-price/callback read-back passed without network access or runtime errors. Database table, snapshot column and three draft/immutability guards confirmed; preview build OK. Styled authenticated screens and durable signed-in save/read-back remain unverified.
- [ ] Contract overlap resolution and actual SOW execution, entity coverage, first-period invoice ownership and contract-gated enrollment — release blocked pending explicitly approved operational/access design and isolated QA evidence; draft scope is not an executed SOW.
- [ ] Prospective reconciliation schedules, explicit legal-entity authorization and client/portfolio reviewed-report views — blocked on entity-book access review and service-critical accounting audit fixes before customer access.
- [ ] Authenticated quote save/read-back and full acceptance checks — blocked until independently isolated synthetic QA passes preflight. No live invoices, bank connections or production enrollments.

## Internal Sales MSA display (2026-10-22)
- [x] Collapse locked MSA terms and packet details by default in the shared proposal/RFP/RFQ editor; quote detail already omits MSA text. Existing editing authority and client signing views unchanged.
- [x] Fictional accordion display verified closed by default, expandable and collapsible with no runtime errors; 16 existing MSA/locked-section tests passed and preview build OK. Authenticated walkthrough remains blocked on independently isolated QA.

## CRM company and contact details (2026-10-22)
- [x] Save and update contact title/phone with audit values; durable scoped company links connect authorized CRM contacts, activity, emails and deals. Existing prospect organizations backfilled without merging people or changing access.
- [x] 15 focused offline checks passed; fictional CRM walkthrough verified company contacts/activity/emails and title/phone edit/read-back; preview build OK, no real records or emails used in testing.
- [ ] Authenticated save/read-back — blocked until independently isolated synthetic QA exists.

## Sales client responses (2026-10-22)
- [x] Add response instructions, recorded single-recipient Sales responses, and client review/sign/change-request status to quotes, RFPs and RFQs using existing staff history and recipient/version-bound links; client feedback has its own append-only evidence without attributing it to staff. Approved terms, signatures and invoices unchanged.
- [x] 29 focused offline checks passed; fictional response instructions save/send display verified with no overflow or runtime errors, preview build OK; no real records or emails used in testing.
- [ ] Signed-in sending, client feedback and read-back — blocked until independently isolated synthetic QA exists; real email delivery unverified.

## Add contact while sending a quote (2026-10-22)
- [x] Add missing-contact entry on quote recipients and proposal/RFP/RFQ sending using the existing CRM prospect engine, duplicate-email reuse, scoped conditional assignment and recipient refresh; no account membership or automatic email granted.
- [x] 26 focused offline checks and fictional form save/error recovery passed, desktop/compact views without overflow or runtime errors; preview build OK.
- [ ] Signed-in contact creation and sending — blocked until independently isolated synthetic QA exists; no real contacts or emails created during testing.

## Signed-SOW quarterly commissions (2026-10-22)
- [x] Client SOW signing, quote/proposal/RFP/RFQ acceptance and Harmonious countersigning call the shared commission handoff; existing paid invoices queue automatically and future paid invoices use the same canonical queue. Assigned reps receive a payment-dependent signing notice or their own quarterly scheduled amount; no actual payout is initiated.
- [x] 26 focused offline checks passed, including quarterly dates, unpaid/void/unsigned exclusions, quote-linked invoices, confirmed recipients and retry deduplication; preview build OK.
- [ ] Authenticated signing/payment/email walkthrough blocked until independently isolated synthetic QA exists; no production SOWs, payments or emails changed.

## Searchable contact selection (2026-10-22)
- [x] Shared searchable contact/person picker applied across Sales, CRM, Inbox, fund setup/signers, client teams, professional access, task assignment, accounting and investor/capital records; existing option readers, callbacks and disabled choices preserved. Sales recipients/CC/signers filter while retaining checked choices.
- [x] Offline fictional browser fixture passed: name/email/firm suggestions, duplicate-name distinction, keyboard selection, no matches, Escape preservation, existing select adapters and checked-recipient retention; preview build OK.
- [ ] Signed-in contact-selection walkthrough blocked until independently isolated synthetic QA exists; no live records or emails changed.

## Selected payment reporting and schedules (2026-10-22)
- [x] Add selected payment calculations and monthly/quarterly/annual totals across commissions, Operations/client invoices and fund payments; existing entitled records only.
- [x] Add separate quarterly/annual planning controls with first date and append-only actor-owned saved plans; canonical records re-read on save, no browser-supplied amounts accepted. Invoice terms and actual commission queue deadlines remain unchanged.
- [x] 24 focused calculation/commission/schedule checks passed; preview build OK. No real payments, invoices, payout records or emails created during verification.
- [ ] Signed-in save/read-back walkthrough blocked until independently isolated synthetic QA exists.

## Isolated diagnostic QA provisioning review (2026-10-21)
- [x] Inspect existing development-backend/draft provisioning options and costs without production changes; independent Cloud remix documented, draft isolation unavailable here, scheduler safety during remix unverified. Findings in docs/diagnostic-qa-provisioning-review.md.
- [ ] Prove independent backend, actual frontend binding and synthetic staff/manager/investor authority; run existing preflight before authenticated checks — blocked until isolation exists.
- [ ] Verify failed-read/retry, audit filtering, recipient authorization and stale-job screens only after preflight passes; report passed/failed/blocked separately.
- [x] Track email-message association and hardcoded diagnostic header defects explicitly: src/lib/email-delivery.functions.ts:91-156 independently selects recipient-wide events/logs and supplies literal From/domain/Purpose; src/components/application-review.tsx labels them Message headers. Both confirmed by source, unrepaired and not client-ready.
- Phase one accepted as offline-verified only, not fully verified or client-ready; no client/investor resolution messages before affected-flow verification. Webhook recovery, payments, drafts and retention excluded.

## Diagnostic repairs — narrow phase 1 (2026-10-21)
- [x] Current backend metadata confirms production/no development instance; preflight blocks before navigation without reviewed isolation and synthetic sessions.
- [x] Repair existing health/audit failed reads, recursive display filtering, email diagnostic authorization, and stale job display; no business outcomes changed.
- [x] 39 offline targeted checks passed; preview build OK; separate retention proposal in docs/diagnostic-phase1-results.md.
- [ ] Authenticated read-back/positive QA preflight blocked: independently isolated backend and synthetic reviewer evidence unavailable.
- Retention, webhook replay, payment atomicity, drafts and broad telemetry remain unchanged.

## Invoice pricing consistency (2026-10-21)
- [x] Align manual invoice preparation and rate review with scoped frozen fund/contracted rates; preserve issued invoices and existing approvals; conflicting frozen terms stop preparation.
- [x] 32 focused invoice pricing, schedule and commercial pricing checks passed; no invoices issued, sent or charged.
- [ ] Signed-in invoice preparation/read-back blocked on isolated synthetic QA; no production test invoices created.

## Reviewer QA walkthrough (2026-10-21)
- [x] Start separate Investor reviewer QA draft; verify backend isolation before any synthetic records or invitations.
- [ ] Provide an isolated, signed-in Harmonious reviewer path for checking every canonical investor step — blocked: the draft shares live records; no safe QA link yet.
- [ ] Validate QA-only browser coverage and reviewer verification record against synthetic QA access — blocked on independently isolated backend and reviewer account; draft hardening not accepted or published.

## Investor checklist consistency (2026-10-21)
- [x] Replace legacy verification, upload and signature checks with the exact investment's canonical journey; share its query cache and scoped step links. Unlinked commitments show no invented checklist.
- [x] 33 focused consistency/journey/tax-step checks passed; preview build OK. No investor decisions, signatures or financial records changed.
- [ ] Signed-in read-back blocked on isolated synthetic QA; shared production browser testing remains prohibited.

## Missing banking controls (2026-10-21)
- [x] Expose existing bank ownership/verification, stepwise account status and investor release actions beside saved instructions on fund Banking and Setup; preserve existing server checks, no real approval or release performed.
- [x] 31 focused banking/access tests passed; preview build OK.
- [ ] Signed-in end-to-end verification blocked on isolated synthetic QA; no real bank status changed.

## Harmonious investor approval and Calvin executed copy (2026-10-21)
- [x] Permit existing authorized Harmonious investor-operations staff to approve admission alongside exact-fund managers; preserve readiness and own-investment safeguards, audit actor and investor notices.
- [x] 59 focused authorization/document/email checks passed; preview build OK. Signed-in approval walkthrough remains blocked on isolated synthetic QA, not performed on real investors.
- [x] Retrieved original completed signing-service PDF; Calvin's $500,000 signature and Thomas's acceptance both dated October 21, 2026; saved unchanged to Files.

## Wealth paid activation and pricing (2026-10-21)
- [x] Confirm Portfolio and Report Cards have no published rate-card price; catalog values are zero placeholders, not free services.
- [x] Record quarterly or annual billing preference.
- [ ] Competitor pricing comparison requested before selecting dollar prices.
- [ ] Pricing page and paid activation — waiting on approved dollar prices and service terms; no charges or subscriptions started.

## Thomas signing request (2026-10-21)
- [x] Thomas personally countersigned at 17:27:41 UTC October 21, 2026; completed original PDF verified. No signature applied by the assistant.

## Direct fund-signatory email (2026-10-21)
- [x] Add Email signatory to sign on approved outstanding fund signatures; native requests resend the existing signing email, embedded requests email the exact protected countersign page, never convert or recreate signatures.
- [x] 50 focused signing/approval/email checks passed; preview build OK; no real emails or signatures applied.
- [ ] Signed-in delivery walkthrough blocked: isolated synthetic QA sessions unavailable; native email inbox delivery remains unverified.

## Thomas countersigning screenshot (2026-10-21)
- [x] Located My Funds → CORPS Erebor → Investors → Calvin → Documents & signed agreements → Approve & sign; recorded Thomas signer remains sent with no signed_at.
- [ ] Signing-screen screenshot blocked by account authenticator setup in Alyssa's own authorized session; no Thomas impersonation or security bypass performed.

## Combined wealth dashboard (2026-10-21)
- [x] Combine owned fund investments, personal holdings and connected balances; securities are not added to brokerage balances twice and sandbox balances are excluded.
- [x] Net worth by currency with append-only debt corrections; dated cash flow from posted fund receipts and owner-recorded personal activity, plus summary export.
- [x] 69 focused wealth/account/distribution checks passed; preview build OK.
- [ ] Signed-in dashboard QA requires an isolated synthetic environment; live feeds remain sandbox-only and no financial data was changed for testing.

## Read-only account aggregation (2026-10-21)
- [x] Owner-only encrypted bank/brokerage connections, consent history and immutable snapshots, isolated from fund books and payments.
- [x] Connect source-dated balances and securities to Portfolio and Wealth; manual refresh, verified webhook refresh, reconnect, disconnect and retained history.
- [x] 35 focused checks passed and preview build OK; direct synthetic bank retrieval returned 14 accounts and brokerage retrieval returned 13 positions. Temporary test items revoked; no real accounts accessed.
- [ ] Live feeds — existing credentials use sandbox; production account/product access and institution coverage remain unverified. No production switch performed.
- [ ] Signed-in QA — blocked on an isolated QA environment with a synthetic investor session; no real user account used for testing.

## Portfolio and personal wealth services (2026-10-21)
- [x] Add both services to the shared catalog and current-client service options; fund add-on pricing requires a real published rate or approved quote, not the catalog's zero default. Standalone/fund preferences retain history, never activate charges.
- [x] Provide owner-only personal holdings, dated corrections, multi-currency separate totals, exports and personal risk Report Cards through the existing engine, without a fund.
- [x] 109 focused privacy, history, pricing and navigation checks passed; preview build OK. Compared official wealth-platform offerings and identified aggregation, liquidity, ownership and professional collaboration opportunities.
- [ ] Pricing and standalone paid activation — blocked on approved prices and commercial terms; no prices invented or subscriptions started.
- [ ] Signed-in read-back — blocked on isolated synthetic QA; shared production browser tests prohibited.

## Alyssa review evidence (2026-10-21)
- [x] Connect saved signed copies, acknowledgments and questionnaire to the fund manager's investor detail; show the owner's signed archive below the submitted journey too.
- [x] 26 focused evidence, ownership and download checks passed. Saved Alyssa subscription v3, PPM v1/OA v2 acknowledgments and submitted questionnaire confirmed; no signatures or approval changed.
- [ ] Signed-in read-back — blocked on isolated synthetic QA; shared-production browser testing prohibited.

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

## Forecasting (paid add-on)
- [x] Guided fund growth, expenses, capital calls and distributions with live cash-flow summary, separate cash/NAV and shortfall alerts; 34 offline forecast tests passed. Fictional form updates verified; signed-in save/read-back remains blocked by isolated-QA preflight.
- [x] Operating forecast inputs, monthly compounding, direct costs and operating expenses, and monthly/calendar-quarter profit tables and charts; 28 forecast regression checks pass. Signed-in save/read-back remains blocked by isolated-QA preflight.
- [x] Forecasts tab built, gated by paid Forecasting add-on
- [ ] Forecasting price — waiting on Alyssa
- [x] Guided scenario forms with round, exit-year and cap-table holding selectors; all four existing models and version saves retained; 17 offline checks pass.
- [ ] Signed-in forecasting check — blocked pending independently isolated synthetic QA.

- Payment schedules: pure signed-SOW quarterly/annual model and tests added; database migration, upgrade/signature hooks, due-invoice delivery, Commissions panel, and daily cron remain pending (required database tools unavailable).

## Recurring payment schedules
- [x] Signed-SOW quarterly/annual payments shown on Commissions, auto-invoiced with rep notice (daily run)
- [ ] Signed-in check of Scheduled payments and a real due-date send — pending

## Commission planning
- [x] Expected quarterly payouts at SOW signing (computed, nonpayable; replaced by actual invoice periods)
- [x] Commissions: revenue, gross profit, net profit and gross-profit commissions; append-only actual costs and effective cost/overhead assumptions.

## Signed-SOW next payouts (2026-10-22)
- [x] Next payout by person and deal, scheduled-first stable selection, quarter-end scheduled/expected summary, and quote-filtered tracker dialog.
- [x] Signing notices list the assigned rep's expected dates/amounts using the report's shared gross-profit projection; payment-dependent labels and unchanged delivery idempotency.
- [x] Pure next-payout regression coverage; payouts remain manual with no money movement or migrations.
- [ ] Browser push alerts for client attention items — blocked: needs push service keys and a decision to add a push worker

- [x] Side letters reference OA + Subscription Agreement
- [x] Side-letter count in close pricing
- [x] Archived documents view with investor applicability
- [x] Fix approved account checks reverting to compliance review (profile notices ignored; 3 checks re-read)
- [ ] morgato27 account check: 32 possible watchlist matches await a compliance reviewer (human decision)
- [x] Limited access during identity review + outcome email
- [x] Watchlist match review panel (side-by-side, batch clear with reason)

## Shared manager + Harmonious views (2026-10-23)
- [x] Investors list: one Add investor chooser, one status per row, tabs; staff fund screens use the same list.
- [x] Investor page: staff see the same page as managers plus the KYC/AML review card (staff only).
- [x] Approvals & requests: one shared area (Open items / Approvals / Requests) on manager and staff fund pages.
- [x] Documents: one Documents tab layout for both sides (Fund files, Send to investors, Investor uploads); generation remains staff-only server-side.
- [ ] Fund setup: one checklist with You / Harmonious owner per step.
- [ ] Verification wording shared everywhere.
- [ ] Fund/investor messages shown on the fund and investor pages.
- [ ] Capital: same committed/received/reconciled figures on both sides.

## Paperwork contact and legal-name catch (2026-10-26)
- [x] Add investor now offers an optional paperwork contact (name, email, relationship: spouse/family/assistant/advisor/attorney/other). The invitation and reminders go to the contact; the investor's legal name stays on the agreements and the investor still signs. Contact is recorded as a related person (paperwork_contact:<relationship>) with safe-match review, shown in a read-only Paperwork contact block; wire reports carry an optional senderName so a wire from a spouse or entity matches the notice, never auto-marks funded.
- [x] Choosing an existing individual/joint profile whose legal first name differs from the investor's blocks the save until the manager confirms who is investing (prefix-tolerant, so Kim matches Kimberly). Entity/trust/IRA profiles are never flagged.
- [x] Sixty-two focused investor-record tests pass, including the Kimberly/Joe Girardi spouse case; typecheck clean.
- [ ] Expected wire sender on the funding step (wire from a different name matches a recorded note, staff still review) and helper role labels on the investor record: not yet built.
- [ ] Authenticated walkthrough of the new form, blocked on independently isolated synthetic QA sessions.
- [x] Wire report form offers "Name on the sending account" so a wire from a spouse or company matches the notice; shown on the funding ledger and in the record history. Informational only, never marks funded.
- [x] Investor record shows a Paperwork contact block with the helper's name and relationship, separate from owners and signers.

## Fictional QA sandbox (2026-10-26)
- [x] /qa-sandbox renders the real investor form and wire sender against an in-memory fictional backend (fictional fund Fablewood Ventures I LP, manager, investors, bank); all server calls intercepted, unmodeled calls blocked, nothing persisted or emailed.
- [x] Verified click-through: search match with masked email, duplicate-email blocker, confirmed create to fictional record page, wire prefill/save, fund-manager view hides staff-only wire controls. 8 mock tests pass; build OK.
