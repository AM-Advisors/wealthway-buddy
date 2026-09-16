# Roadmap

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
- [ ] Entity register, entity page, engagement workspace (staff)
- [ ] Configurable service catalogue (codes, categories, pricing model, entity types, scope, deliverables, exclusions, required info/docs, dependencies, workflows, owner, status)
- [ ] Service packages (e.g. Fund Launch) that add/remove individual services
- [ ] Commercial terms snapshot per engagement with pricing version; executed terms never change
- [ ] Add / change / cancel a service via change orders, not new MSAs
- [ ] Agreement types: MSA, service order/SOW, amendment, change order
- [ ] Client review summary (what, cost, what changed, what to approve) + per-section approve / request change
- [ ] Ready-to-approve signature screen with acknowledgements and locking
- [ ] Client home: "Your Harmonious services" by entity + Add a service or entity
- [ ] Universal request router (launch fund/SPV, add service, add entity, move to Harmonious, filing, transaction support, other)
- [ ] Service delivery workflows instantiated automatically on execution
- [ ] Harmonious services administration console (catalogue, packages, pricing versions, templates, change orders, approvals)
