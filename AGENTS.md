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
