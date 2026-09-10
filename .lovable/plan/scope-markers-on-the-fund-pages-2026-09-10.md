# Scope markers on the fund pages

Every step on a fund page will say whether it sits inside the client's active statement of work,
and steps outside it are replaced with the out-of-scope notice and a "Request service" button.

## What each screen shows

Each section on a fund page (documents, onboarding, KYC/AML, accreditation, banking and wires,
funding, distributions, filings, tax, reporting) gets a small scope marker:

- In scope — normal section, marked "Included in scope".
- Optional, pending or not included — the section's controls are replaced with the standard notice:
  "This service is not currently included in your active scope. Request service." plus the request
  form already used elsewhere.
- Not recorded yet — Harmonious staff see the section with a "Scope not recorded" warning and can
  keep working; fund managers and investors see the out-of-scope notice instead. This keeps funds
  set up before scope tracking from stalling while flagging them for follow-up.

A short summary strip at the top of each fund page reports how many steps are in scope, how many are
awaiting approval and how many are outside it, with a link to the client's full scope page.

## Screens covered

- Admin fund page — every card wrapped with its matching service.
- Fund manager fund home — setup progress, documents, diligence, signatures, tax documents and
  applications.
- Investor-facing fund pages — apply, funding and document steps.

## Which service governs which step

| Fund page section | Service |
| --- | --- |
| Offering documents / packet | Subscription-document collection |
| Signed copies | Subscription-document collection |
| Investor applications, onboarding | Investor onboarding |
| Identity and screening panels | KYC, AML, sanctions screening |
| Accredited-investor steps | Rule 506(b) onboarding / Rule 506(c) verification |
| Bank feed, wire instructions | Bank-account setup, wire-instruction management |
| Funding tracking, commitment balances | Investor funding tracking |
| Distributions | Cash distributions |
| Filing panels | Form D, Blue Sky, filing-deadline tracking |
| Tax documents | K-1, 1065, 1042-S coordination |
| Reporting, capital accounts | Investor reporting, capital-account tracking |

506(b) versus 506(c) is chosen from the fund's own exemption so only the relevant one is checked.

## Scope of this change

Per your answer, this is a screen-level gate: sections outside scope are hidden behind the notice.
The money-movement and application steps keep the existing hard stops already in place (fund
conditions, holds, approvals); no new server-side refusals are added. If you later want a stale page
or direct link to also be refused, that's a follow-up.

## Technical notes

- New `src/lib/fund-scope.ts` helper: maps section keys to catalog service keys, resolves the
  506(b)/506(c) variant from `offerings.reg_type`, and returns the effective status.
- New `useFundScope(offeringId)` hook wrapping the existing `getFundScope` server function, cached
  per fund so each page makes one call.
- `ServiceGate` gains a `viewerIsStaff` prop so "unset" renders children with a warning for staff and
  the request card for everyone else.
- New `ScopeBadge` and `ScopeSummary` components; sections wrapped in `ServiceGate` on
  `admin.fund.$fundId.tsx`, `manager-fund-home.tsx` and the investor fund/apply/funding views.
- No database changes.
