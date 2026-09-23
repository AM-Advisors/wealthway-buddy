# Consolidation Stage 1 — Single Authoritative Workspace Resolver

Refactor only. No route removals, navigation redesign, dashboard consolidation, RLS changes, or financial/compliance/onboarding/KYC/tax/banking/money-movement/reporting behavior changes. Stop after this stage.

## Target architecture

```text
requireSupabaseAuth
  -> gatherFacts(context)            src/lib/session-facts.server.ts   (only DB access)
  -> resolveSession(facts)           src/lib/session-resolution.ts     (pure rules)
  -> projections                     workspaces / operations / professional / legacy shapes
```

`gatherFacts` moves out of `session.functions.ts` into a server-only module so every compatibility function can call it. Each call re-reads records on every request — no caching, so revocation takes effect immediately.

## 1. Richer canonical facts (no new tables)

`RelationshipFacts` grows with fields that keep full detail instead of flat booleans:
- person: userId, email, name
- staff: active, roles (all `user_roles`), staffRoles (Harmonious internal), deactivated flag, granular Operations capabilities (from the existing `ops-capabilities` model / `getOperationsContext` source)
- legacy role markers: `user_roles` `fund_manager` role kept separately from `fund_managers` relationship rows (they are different today)
- investmentProfileIds, investorPositionIds, application summary (id + statuses already used by nav/destination)
- managedFundIds, clientIds, companyIds (non-revoked cap-table access)
- professional: memberships (id, organizationId, name, type, seatRole, status)
- delegations: every row for the delegate with id, principal, organization, status, acceptance, scope, expiry/revocation — active list derived from it, not stored as a boolean
- pendingInvitations, outstandingRequirements (unchanged logic)

All independent queries run in one `Promise.all`; the invitation and onboarding lookups stay sequential only where they depend on earlier results.

## 2. Compatibility functions re-backed

Public signatures and output shapes stay the same:
- `resolveSession`, `enterWorkspace` (session.functions.ts)
- `allowedWorkspaces()` in attention.functions.ts -> `availableWorkspaces(facts)` mapped to attention kinds
- `getAdminAccess` -> projection from facts.roles + managedFundIds
- `getOperationsAccess` -> projection from facts.staff
- `getProfessionalStanding` -> projection from facts.professional + delegations
- `getNavState` -> identity + application from facts (step computation unchanged)
- `getOperationsContext` -> consumes facts.staff; granular capabilities preserved

Before each change, a parity test pins its current output for the scenario set.

## 3. Action Center

Only the workspace-discovery half of `attention.functions.ts` changes. `attention.server.ts` collectors, professional per-delegation `canAct` checks and output are untouched. Not merged with the Operations queue.

## 4. Shell and client workspace

- `_authenticated/route.tsx`: shell choice (Client vs Operations) takes the Operations flag from resolver output; pathname only picks the layout, hostname grants nothing. No visual changes.
- `client-workspace.tsx`: keeps the selected workspace as presentation state; the list of choices comes only from `resolveSession`; stored selections not present in the server list are discarded and incompatible client context cleared.

## 5. enterWorkspace

Authenticate -> fresh facts -> requested id must be in current `availableWorkspaces` -> refuse invented/stale/revoked -> response tells the client to clear incompatible stored context.

## 6. Tests

Parity (fake Supabase builder, existing style): investor only, multiple profiles, fund manager, company user, professional delegate, multiple delegations, staff, deactivated staff, investor+staff, manager+investor, company+investor, professional+investor, staff+manager, pending invitation, revoked delegation, expired delegation, removed company access, removed manager relationship. Multi-role cases assert all workspaces returned; `defaultWorkspace` only picks a destination.

Adversarial: `operationsAccessFromEmail` false and @harmonious.co grants no staff/admin/workspace/capability; invented workspace rejected; other person's profile, other manager's fund, other company, other professional's delegation rejected; revoked relationship not restored from local storage; ops hostname grants nothing; app hostname does not strip staff facts; requested workspace never broadens facts; next-request loss after staff deactivation, capability removal, delegation revocation, manager/company removal.

Finish with full suite, typecheck, production build.

## 7. Behavior differences to report, not silently normalize

Already visible before implementation (to be confirmed by parity tests and labelled BUG IN OLD PATH vs REGRESSION):
- `getOperationsAccess` recognises only `admin`/`operations`; the resolver recognises ten staff roles.
- `getAdminAccess` derives fund manager from the `user_roles` `fund_manager` role; the resolver uses `fund_managers` relationship rows.
- `getProfessionalStanding` counts active delegations regardless of acceptance; the resolver requires accepted/not-required.
Compatibility outputs keep the old behavior unless the old output is demonstrably unsafe; each case is listed in the report.

## Deliverable

Report: architecture, files changed, compatibility functions now backed, queries eliminated, remaining duplicate probes, before/after query counts (with N+1 and concurrency notes), parity and adversarial tests added, total checks, typecheck, build, behavior differences. Then stop.
