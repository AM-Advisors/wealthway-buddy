# Harmonious platform comparison and combination plan

## What was compared

- **This project (Harmonious Onboarding / Operations):** 280 pages, 525 business modules, about 410 data tables.
- **The other project, "Harmonious" (brand-canvas):** 198 pages, 861 business modules, about 500 data tables. It uses the same technology, so its code can be reused here.
- About 300 of the other project's data tables don't exist here. Many screens overlap, but they are built on different data models.

## Where each project is stronger

| Area | This project | Other project |
|---|---|---|
| Investor onboarding (About You, Verification, Sign, Fund), one record per person, investment readiness | Stronger | Basic |
| Fund setup, offering documents, signatories, banking, EIN/SS-4 | Stronger | Has entity formation orders, EIN applications, beneficial owner (BOI) reports |
| Access control, second-person approval rules, View As, delegated professionals | Stronger | Has single sign-on (SSO), API keys, access alerts |
| Pricing, SOWs, Sales overview, team ownership | Stronger | Has billing events |
| Tax | 1065/1042/1099 prepare and review | Full 1065 builder, K-1 filing, Form PF, IRS e-file records |
| Accounting and treasury | Ledger, financial reporting, statement reviews | QuickBooks connection, bank rules, Plaid reconciliation, treasury alerts, capital events with approval deadlines |
| Closings | Capital statements at closing | Close sheets, closing reminders, funding tracking |
| Compliance | Controls, evidence registers | Obligations and rules engine, exams, filing checks, regulatory change tracking, Blue Sky fee checks |
| Investor relations and growth | Limited | CRM (contacts, deals, email sequences), messaging, data-room sharing |
| Portfolio | Valuations | Portfolio assets, info requests, earnings intelligence, exit/secondary listings |
| E-signing | Box Sign | Its own built-in e-sign module |
| Marketing site | Basic public pages | Solutions, comparison, resources and SEO pages |
| Quality checks | Unit tests | Unit tests plus automated end-to-end and CI workflows |

**Summary:** the other project covers more services (CRM, formation, K-1/1065 filing, treasury, compliance engine, portfolio, exits, marketing pages). This project has the stronger core: the investor and fund records, onboarding, authorization and approval safeguards.

## Recommended approach

Keep **this project as the base**, because its authorization rules and single records for each person, fund and investment are the part that is hardest to rebuild. Bring the other project's services in one module at a time. Each module is rebuilt on this project's records (Person, Investment Profile, Investment, Fund) and access checks rather than copied over with its own separate tables.

Copying is one-way: code can be read from the other project into this one. No data moves between the two databases, and the other project is never changed.

## Phases (each one approved separately before it's built)

1. **Detailed inventory (read-only):** a written map from each module in the other project to what exists here: keep ours, adopt theirs, or merge. Includes a list of duplicates to avoid, such as two e-sign systems or two ledgers.
2. **Low-risk additions:** marketing, solutions and resources pages; the end-to-end test setup; admin health screens (email failures, webhook log, deploy status).
3. **Operations services:** entity formation orders, EIN applications and BOI reports, all in Fund Setup. Nothing is filed automatically; they are recorded only.
4. **Tax depth:** the 1065 builder, K-1 filing workflow and Form PF, inside the existing Tax workspace with its prepare/review rules. There is no automatic e-filing or payment.
5. **Treasury and closings:** bank rules and reconciliation suggestions, close sheets, capital events with approvals. Every item needs a person's approval, and no money is moved.
6. **Compliance engine:** obligations, rules and deadlines, added to the existing Compliance & Controls records.
7. **Growth:** CRM, messaging and data-room sharing, following the Sales commercial-only access rules.
8. **Portfolio and exits:** portfolio assets, info requests, earnings intelligence, secondary listings.

Each phase ends with the full test suite, a code check, a build, and no change to existing production records.

## Technical details

- Snapshot of the other project, read-only: commit 099e6f8b.
- Porting rule: adapt the other project's server functions to `requireSupabaseAuth` and the existing staff and fund-scope checks. Map their `crm_contacts`, `esign_signers`, `investors` and similar tables onto `persons`, `investment_profiles` and `investor_onboardings` through Person Resolution. New tables use migrations with GRANTs, RLS and append-only history where decisions are recorded.
- Their built-in e-sign is not adopted; Box Sign stays the single signature system, with status from `document-execution-status.ts`.
- One ledger: their QuickBooks and bank features feed this project's existing accounting records rather than a second set of books.
- Their pointer-only assets (2 files) are re-uploaded only if needed.
