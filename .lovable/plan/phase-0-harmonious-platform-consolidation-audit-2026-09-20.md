# Phase 0 — Harmonious platform consolidation audit

No code, routes, permissions or domains were changed. This is the report you asked for, followed by a staged plan awaiting your approval.

## A. Current route inventory (199 pages behind sign-in)

All signed-in pages live under one layout (`_authenticated`) that checks only "is someone signed in", then renders one shared sidebar. There is no separation between the client experience and internal operations today — only sidebar groups that appear or disappear.

| Family | Count | Purpose | Who it is really for |
| --- | --- | --- | --- |
| `/admin/*` | 54 | Applications, clients, contracts, pricing, invoices, wires, distributions, entities, funnel, audit, security, email preview, cap-table administration | Harmonious internal |
| `/ops/*` | 13 | Accounting, valuations, NAV, allocations, financial/performance/investor reporting, banking, EIN, tax documents, team | Harmonious internal |
| `/manager/*` | 33 | Fund manager workspace: funds, investors, approvals, cash, NAV, valuations, allocations, financials, reporting, distributions, per-fund tabs | Client (fund manager) |
| `/client/*` | 27 | Agreements, SOW, invoices, payments, wires, banking, services, inbox, sign-offs, full cap-table suite | Client (company/GP) |
| `/professional/*` | 16 | Delegated professional workspace, acting-on-behalf, tasks, signatures, credentials, verification | Client (delegated) |
| Investor top-level | ~25 | `/dashboard`, `/documents`, `/statements`, `/investor-*`, `/vault`, `/wire`, `/portal`, `/my-equity`, `/prepared`, `/access`, `/signatory`, `/subscription`, `/onboarding/*`, `/investment/$id` | Client (investor) |
| Shared/ambiguous | ~20 | `/diligence`, `/documents`, `/capital`, `/staff`, `/provider`, `/shares`, `/route`, `/home`, `/accounts`, `/sign-off` | Mixed — must be classified individually in Stage 0.1 |

**Important finding:** the `/admin` prefix is not a reliable signal. Several `/admin/*` pages are client-facing work surfaces (rate proposals, agreements, invoices), and several `/manager/*` and `/client/*` pages expose internal-grade material (reconciliation, accounting-adjacent NAV evidence, cap-table migration internals). Classification must be per page, done by reading each one.

## B. Route migration map (rule, not yet a per-file list)

- Investor top-level, `/manager/*`, `/client/*`, `/professional/*` → **CLIENT** (`app.harmonious.co`), re-pathed under `/investor`, `/fund`, `/company`, `/advisor` with contextual workspaces instead of 30 flat links.
- `/admin/*` and `/ops/*` → **OPS** (`ops.harmonious.co`), regrouped under the 13 operations sections.
- `/auth*`, `/client-login`, `/manager-login`, `/reset-password` → **AUTH**, consolidated into one path with one resolver.
- Public marketing/offering pages, invite and token pages (`/invest/$slug`, `/fund/$slug`, `/cap-claim/$token`, `/shares/$token`) → **SHARED**, stay public and stay working.
- `/route`, `/home`, `/portal`, `/staff`, `/accounts` → candidates for **DEPRECATED**; keep as redirects, delete nothing in this programme.

The exhaustive per-page table (current → category → new path → owning service) is Stage 0.1 output; producing it requires reading all 199 pages and would be stale the moment we start moving them.

## C. Sidebar inventory — what is wrong today

One file (`app-sidebar.tsx`) hard-codes 9 groups and roughly 110 links. Problems:

- Every signed-in person, including investors, gets the "Your application" group with 17 links and the full **CapTable founder group with 14 links** — regardless of whether they have a company. Visibility only, but it is noise and it misrepresents entitlement.
- Fund managers see 13 global links plus 7 per-fund links; fund-scoped things (investors, NAV, valuations, allocations) are global instead of inside the fund.
- Harmonious staff see 3 groups totalling ~40 links, flat, plus the 13 operations links.
- Duplicates: distributions appear at `/admin/distributions` and `/admin/money`; wire instructions at `/admin/wire`, `/admin/bank-accounts` and `/admin/client-bank-accounts`; cap table under both founder and staff groups; performance at `/manager/performance`, `/manager/performance-reporting` and `/ops/performance`.
- Open/closed group state is stored in the browser only; there is no workspace switcher and no "acting on behalf of" banner in navigation.

## D. Proposed client navigation

- **Investor:** Home, Investments, Activity, Reports, Documents, Tax, Profile. Wire instructions, confirmation, statements, performance, vault and prepared items move inside the investment workspace.
- **Fund manager:** Home, Funds, Investors, Capital, Reports, Documents, Profile. Per-fund tabs: Overview, Investors, Investments, Capital, Reports, Documents — no accounting, reconciliation or internal compliance.
- **Founder/company:** Home, Company, Cap Table, Stakeholders, Transactions, Documents, Reports, Profile — shown only when the existing cap-table authorization grants it, never from email domain.
- **Professional:** Home, Clients, Tasks, Documents, Profile, with a persistent "Acting on behalf of" banner and no capability implied by membership alone.

## E. Proposed operations navigation

Home, Clients, Funds, Investor Operations, Capital Operations, Accounting, Reporting, Compliance, Tax, Documents, Approvals, Audit, Administration. Today's 67 internal links map underneath these 13 without any page being deleted.

## F. Authentication map

- Four entry points: `/auth` (password + Google), `/auth/register`, `/auth/forgot` → `/reset-password`, plus `/client-login` (its own password + Google form) and `/manager-login` (a redirect shim).
- **Google OAuth is already direct, not Lovable-managed.** `src/lib/google-oauth.ts` calls `supabase.auth.signInWithOAuth` with your own provider configuration. A Lovable wrapper module still exists at `src/integrations/lovable/index.ts` but no sign-in page imports it — it is dead code, safe to remove in a later stage.
- Post-login routing is **client-side** (`src/lib/post-signin.ts`): it reads `user_roles` in the browser and sends admin → `/admin`, operations → `/ops`, fund_manager → `/manager`, else `/dashboard` or `/onboarding/kyc`. This is the single biggest architectural gap: routing decisions are made in the browser and duplicated across login pages.
- The gate itself (`_authenticated/route.tsx`) checks only that a user exists. All real authorization is enforced per server function — which is correct — but there is no one resolver.

## G. Domain migration map

- `onboard.harmonious.co`: **75 hard-coded occurrences across 48 files** — email templates and senders, invitation and portal links, tracking base, sitemap, OG images, Box/Didit redirect URLs, closing notices, operations notifications.
- `app.harmoniouscapitaladmin.com`: **zero occurrences** in the repository. Nothing to migrate in code; any live links are DNS/registrar-level only.
- No occurrences yet of `app.harmonious.co` or `ops.harmonious.co`.
- Migration rule: replace every literal with two configured origins (client and operations) resolved server-side, default to the client origin, and keep `onboard.harmonious.co` serving path-preserving redirects so historical invitation links keep working.

## H. Sources of truth (already single, keep them)

Person → `profiles`/identity; auth → Supabase auth; vehicle → `investment_profiles`; identity check → `kyc_verifications`; entity check → `entity_verifications`; accreditation → `accreditation_records`; subscription → `investor_onboardings`; investment → `investor_positions`; commitment → `commitment_events`; funding → `bank_transactions` → `bank_reconciliations` → journals; capital → `capital_accounts`; NAV → published NAV; performance → performance engine; reports → `financial_reports`/investor packages; documents → document registry; permissions → `user_roles`, `fund_managers`, `delegations`, cap-table permissions. The consolidation is presentation-layer only — no engine is rebuilt.

## I. Duplicate-state audit

Genuine duplicates are in navigation and status wording, not in the ledger: legacy `investor_applications` status fields run in parallel with the newer `investor_onboardings` lifecycle; sidebar counts come from a separate counting function rather than the workflow queues; several pages show the same record under different names (manager vs ops NAV, manager vs ops performance). Stage 6 reconciles these views onto one workflow read.

## J. Internal permission model (recommendation only)

Today internal access is two booleans: `admin` and `operations`. Recommend adding named capabilities — client operations, fund administration, investor operations, compliance, accounting, NAV/valuation, reporting, tax, capital operations, payments, cap table, documents, audit read-only, system administration — each split into see / prepare / review / approve / execute. Existing admins keep exactly what they have until you approve an explicit migration; no staff permission changes in this programme without your sign-off.

## K. Risks

Authentication (one resolver replacing four paths), session scope across two subdomains, invitation deep links embedded in already-sent emails, 75 hard-coded domain strings in live email templates, stale client-side role state, and the standing financial-control risk of touching approval surfaces. Mitigation: nothing is deleted, every old path redirects, money and approval logic is untouched, and the full suite (671 tests) runs at every stage.

## L. Implementation stages (each ends in your approval)

1. **Domain and authentication foundation** — configured origins, server-side post-login resolver, one sign-in path, legacy paths redirect. No UI reorganisation.
2. **Client navigation shell** — capability-driven sidebar per client type; old routes still resolve.
3. **Operations navigation shell** — 13 sections, operations access re-checked server-side on every request.
4. **Client 360 and Fund 360** — internal workspaces over existing services.
5. **Universal onboarding** — requirement-driven, resumable, backend-authoritative, three layers (person, profile, investment).
6. **Authoritative synchronisation cleanup** — one workflow state behind both client and operations views.
7. **Legacy route and domain migration** — path-preserving redirects, email templates switched to configured origins.
8. **Security regression** — the 22 proofs you listed, added to the existing suite.

Each stage: no deletions, redirects for anything moved, full test suite plus typecheck and build before it is called done.

## Technical notes

- Origins become server-resolved configuration read inside handlers, never hard-coded; redirect targets validated against an allow-list to prevent open redirects.
- The post-login resolver is a single authenticated server function returning person, staff authorization, relationships, pending invitations, outstanding requirements, available workspaces and default destination. Workspace switching re-resolves server-side; the browser never asserts a role.
- Operations authorization is re-checked per request from `user_roles`/staff records, never from hostname, JWT metadata or navigation state, so deactivation takes effect immediately.
- Existing RLS, maker/checker, segregation-of-duties and immutability triggers are untouched throughout.
