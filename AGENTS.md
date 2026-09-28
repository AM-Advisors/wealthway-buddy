<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Access Control Center (src/lib/access-control-model.ts) is a read-only projection of existing auth facts; enforcement never imports it — why: Stage 1 must not change authority.
- Canonical authorization lives in src/lib/authorize.ts (authorize(facts, permission, resource) → structured decision); access writes go only through src/lib/access-admin.functions.ts with escalation checks and append-only access_audit_events — why: one future authority, auditable changes; legacy checks stay until Stage 3 migrates them.
- Stage 3 cutovers must run through src/lib/authz-shadow.server.ts (shadowAuthorize) first; it always returns the legacy decision and logs payload-free categories to authz_shadow_events — why: canonical RBAC must never override legacy enforcement before cutover.
- Atomic Client/Fund permissions live in src/lib/atomic-permissions.ts; broad keys imply only non-destructive atomics, lifecycle/destructive atomics need explicit grant — why: create/edit must never imply archive/close/delete.
- Compliance & Controls (src/lib/compliance-model.ts, compliance-controls.functions.ts) uses append-only compliance_* tables reachable only via server fns gated by administration.* atomic permissions — why: evidence must be tamper-evident and never client-readable.
- Privileged Harmonious roles require an explicit, append-only account classification of Individual (src/lib/account-classification.ts; DB trigger re-checks) — why: shared/integration accounts must never hold admin authority.
- Canonical investment readiness lives in src/lib/investment-readiness.ts (pure projection); readiness views are read-only and investment_readiness_events/tasks are written only by reconcileInvestmentReadiness (after mutations, provider webhooks, or staff reconciliation) — why: page views must never change operational state.
- View As lives in src/lib/view-as.server.ts: a server-only, session-bound, read-only perspective (view_as_sessions) that re-checks staff + canonical relationship each call and renders converted screens through the subject's own server authorization; never token substitution — why: see what clients see without account takeover or elevation.
- Edit-as-Harmonious context (activeEditContext in src/lib/view-as.server.ts) is display-only, server-revalidated each call, auto-closed when stale, and never consulted by save paths — why: the banner must never grant permission or attribute edits to the client.
