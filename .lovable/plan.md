# V2.5 Portfolio and all Report Cards

## What will be added

### Portfolio
- Bring over Overview, Positions, Exposure and Attention, with fund filters, search and position details.
- Show existing assets, recorded cost, effective valuations, valuation dates and available published performance.
- Add position monitoring: stage, vintage, watchlist, risk rating, reporting dates, operating KPIs, thresholds and dated notes.
- Keep asset value distinct from accounting NAV. Unavailable returns and valuations stay unavailable, never estimated from money received.

### Operational Report Cards
- Provide fund, client and administrator views with grades, metric details, period filters and comparisons.
- Calculate only metrics supported by recorded evidence. Missing evidence is marked unavailable; do not copy V2.5's sample scores or invented benchmarks.
- Support manual assessments with evidence attachments, reviewer-controlled publication, version history and immutable corrections.
- Store grading weights and thresholds centrally with recorded changes. Exports respect the same access rules as viewing; no anonymous sharing of private records.

### Investor Report Cards
- Add the risk questionnaire, personalized assessment and action plan to the investor's own workspace.
- Keep questionnaire answers separate from investing profiles' KYC/KYB, accreditation and suitability approvals.
- Show only the investor's authorized holdings and available published reports. Risk scores are informational, not investment advice or permission to invest.

### Diligence Report Cards
- Add findings, category assessments, supporting evidence and a summary to the relevant deal room.
- Preserve internal versus investor-visible material, confidentiality requirements and manager-controlled sharing.
- Use recorded diligence evidence; missing findings never imply a passing grade.

## Access and safety
- Operations, assigned managers and investors get separate views through their existing menus and fund relationships.
- Every read, attachment, export and edit is checked on the server against the actual subject or fund.
- Preserve maker-checker, approved reporting, permanent history and existing Super Admin reason requirements.
- Do not change bank visibility, onboarding steps, identity authority, launch conditions, filings or money movement.
- This adapts features, not V2.5's live records. Importing those records would require an export from that project.

## Delivery order
1. Portfolio views and scoped adapters to current asset/valuation/performance records.
2. Operational Report Cards and durable grading/evidence/publication controls.
3. Investor risk assessment and action plans.
4. Diligence assessments inside the existing deal-room access boundary.
5. Focused tests for access isolation, missing evidence, historical cutoffs, calculations and immutable publication; isolated synthetic browser walkthroughs.

## Technical approach
- Keep TanStack routes and the current shared fund workspace; host/menu partitioning remains in the existing routing and navigation engines.
- Reuse canonical portfolio assets, effective valuation selection, approved NAV, finalized capital activity and published performance. Do not import legacy transaction math, permissions or browser-local reporting audit state.
- Add only missing monitoring and assessment storage through migrations with explicit grants, RLS and server authorization; evidence remains private and versions retained.
- Put presentation in shared components, calculations in tested pure modules, and authorized data access in existing server-function boundaries.
- Do not pool incompatible currencies/periods or average IRRs. Show evidence coverage alongside grades.

## Verification limitation
Signed-in browser testing requires isolated QA and synthetic staff, manager and investor sessions. These are currently unavailable; no production accounts, real assessments, emails or signatures will be used for testing.