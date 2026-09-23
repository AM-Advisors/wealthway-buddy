# Roadmap

- [x] Restructure the investor dashboard around the selected investment and next required action

- [x] Build the approved fund-first management workspace from the uploaded design guide

- [x] Email template preview page (admin-only, renders Harmonious branding exactly as investors see it)
- [x] Per-fund management: each fund gets its own documents, wire instructions, and 506b/506c selection
- [x] Investor portal (/portal): status, funding summary, signed document downloads

- [ ] Switch document signing + storage from Adobe Sign to Box (Box Sign + Box folder storage)
- [x] Google Search Console: verify onboard.harmonious.co, submit sitemap
- [x] Admin-submitted investor application form with status tracking (investors apply for real funds)


- [x] Cap table: live cap table data in the Due Diligence Capitalization section (no file upload needed)
- [x] Diligence room: show fund wire instructions + investor commitment in the overview
- [x] AI diligence assistant with document citations
- [x] Live walkthrough: fund created, docs uploaded, test investor walked room

- [x] Manager onboarding document submission form with status tracking (/manager/onboarding)

- [x] Manager-only diligence portal (/manager/diligence) with room traffic tracking
- [x] Diligence room: "Sync from Box" button that pulls new files dropped in the Box folder into the portal with timestamps and alerts managers

- [x] Bank feed: connect the fund's real bank account so incoming wires are detected automatically and matched to investors
- [x] Fund page button: email the offering packet link (with wire details) to a selected investor

## Universal engagement architecture
- [x] Entities + engagements data model, backfilled from existing funds and agreements
- [x] Entity register, entity page, engagement workspace (staff)
- [x] Configurable service catalogue (codes, categories, pricing model, entity types, scope, deliverables, exclusions, required info/docs, dependencies, workflows, owner, status)
- [x] Service packages (e.g. Fund Launch) that add/remove individual services
- [x] Commercial terms snapshot per engagement with pricing version; executed terms never change
- [x] Add / change / cancel a service via change orders, not new MSAs
- [x] Agreement types: MSA, service order/SOW, amendment, change order
- [x] Client review summary (what, cost, what changed, what to approve) + per-section approve / request change
- [x] Ready-to-approve signature screen with acknowledgements and locking
- [x] Client home: "Your Harmonious services" by entity + Add a service or entity
- [x] Universal request router (launch fund/SPV, add service, add entity, move to Harmonious, filing, transaction support, other)
- [x] Service delivery workflows instantiated automatically on execution
- [x] Harmonious services administration console (catalogue, packages, pricing versions, templates, change orders, approvals)

- [x] Phase 1: professional organizations, memberships, delegations (deny-by-default)
- [x] Phase 2: canonical person, onboarding state machine, investment profiles, entity/trust KYB, per-profile accreditation, readiness checks, My profile page
- [x] Phase 3A: professional workspace, client access manager, read-only acting on behalf of
- [ ] Phase 3B: assist, signing and transaction authority — deliberately not enabled

## Fund accounting
- [x] Step 1: bank feed → reconciliation → general ledger (posting rules, exceptions, maker-checker)
- [x] Step 2: portfolio holdings, versioned valuations, evidence, governance, prepared-only ledger impact, realisations
- [x] Step 3: NAV engine — calculated from posted ledger and as-of valuations, pre-NAV checks, documented overrides, reconciling bridge, maker-checker review/approval, immutable publication and revisions, manager acknowledge/challenge, capital-account handoff
- [x] Step 4: investor allocation engine — positions per investment profile, immutable commitment ledger, versioned allocation policies, time-weighted participation, management fees, waterfall/carry, controlled adjustments and transfers, runs reconciled exactly to fund net assets, finalized capital accounts and versioned investor capital statements
- [x] Step 5a: financial statements, trial balance, general ledger reporting and administrator workpapers — versioned COA-to-statement mappings, accrual/cash/modified bases, statements reconciled to approved NAV and finalized investor capital, comparatives, packages, workpapers with second-person sign-off, period close checklist, draft→prepared→review→approved→published→superseded with preparer≠approver, amendments as superseding versions, full drill-down to source records
- [x] Step 6: performance reporting — fund and investor performance derived only from posted accounting, approved NAV, finalized capital activity and finalized allocations; versioned methodologies per fund type, dated-cash-flow IRR with explicit no-solution handling, MOIC/DPI/RVPI/TVPI against a stated capital definition, TWR around external flows, gross vs net that only claims what it deducts, performance bridge, optional benchmarks, blocking exceptions, immutable publication with superseding revisions, manager acknowledge/challenge, investor view separating "your investment" from fund level
- [x] Step 7: investor reporting centre and reporting packages — packages assembled only from published NAV, capital statements, performance, financial statements, portfolio summaries, capital activity, notices and documents; configurable templates by fund/type/class/frequency; draft→review→approved→published→superseded with frozen component versions and a package manifest; portfolio detail follows fund policy; delegated professionals need explicit capabilities; portal access (not email) is authoritative delivery; Harmonious operations queue, manager acknowledge/challenge, investor centre grouped by profile → fund → period
- [ ] Step 8: tax forms and investor tax reporting

## Fund administration
- [x] Phase A: fund setup, configuration and launch approval
- [x] Phase B: end-to-end investor onboarding and subscription — orchestration records (onboardings, exceptions, append-only events, versioned questionnaires), deny-by-default rules engine, server engine re-resolving authority per call, investor journey page, Harmonious review queue, manager progress board, funding instructions gated on released banking, conservative bank matching, acceptance and closing handed off to existing positions and commitment events
- [x] Phase C: capital calls, funding, cash receipt and investor closing — lifecycle derived from posted accounting, never UI state
- [x] Phase D: distributions, return of capital, withholding and outbound money movement — entitlements from approved economics, withholding from tax documentation, verified destinations with step-up, independent notice and cooling-off, manager + two-person Harmonious approval, provider confirmation correlated not trusted, reconciliation and posted GL before any capital account moves, versioned notices, full audit trail
- [x] Phase D operations integration: distributions in the Operations work queue (batch stage, unbalanced batch, exceptions, cooling-off destination changes, failed/returned payments, reconciliation and accounting pending), Fund 360 Capital and Banking distribution detail, Investor 360 Capital and Tax distribution and withholding detail, /ops/distributions inside capital and banking

- [ ] Delegated transaction authority — deliberately not enabled

## Platform consolidation (client app + operations console)
- [x] Phase 0: architecture audit report (routes, navigation, authentication, domains, sources of truth, risks, 8 stages)
- [x] Stage 1: domain and authentication foundation — configured client/ops origins with open-redirect-safe paths, one server-side post-login resolver (relationships, workspaces, requirements, destination), both sign-in pages routed through it, deep link preserved through sign-in, 24 new tests
- [x] Stage 2: client navigation shell — client shell with workspace switcher, per-relationship menus (investor/manager/company/professional), contextual investment and fund tabs, setup card, delegated banner, new Activity/Tax/Funds/Capital pages, 64 new tests
- [x] Stage 2 audit: signature-block visibility fixed, rate card/catalogue/vendor/eligibility reads tightened, trigger functions no longer callable, remembered browser context cleared on switch and sign-out; 736 tests
- [x] Stage 3 step 1: Operations permission model (13 areas x see/prepare/review/approve/execute), staff-only entry, no-self-approval rule, 13 tests
- [x] Stage 3 step 2: Operations menu at /ops, built from resolved permissions
- [x] Stage 3 step 3: Client / Fund / Investor / Company record pages assembled from existing pages
- [x] Stage 3 step 4: Operations home as a work queue from authoritative workflow state
- [x] Stage 3 step 5 (Stage 3.5): Operations canonicalised to ops.harmonious.co, client to app.harmonious.co, old
      addresses forwarded per path, sign-in never returns a non-staff person to Operations, 28 tests
      — remaining: DNS, hosting and Google/auth callback configuration must be done outside the code
- [ ] Stage 4: Client 360 and Fund 360
- [ ] Stage 5: universal requirement-driven onboarding
- [ ] Stage 6: authoritative synchronisation cleanup
- [ ] Stage 7: legacy route and domain migration (75 hard-coded addresses)
- [ ] Stage 8: security regression (22 proofs)

## Client self-service (funds, investors, cap tables)
- [x] Fund manager Home, Request Fund wizard, setup tracker, bulk investors, cap table setup/actions, Ops + New, Action Center items, tests
- [ ] Browser QA as a dedicated fund-manager and founder account (needs account choice)
