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
- Domain/architecture rules live in src/lib/AGENTS.md; read it before changing any engine, authorization or workflow — why: keeps this file small.
- Never automate filings (except IRS e-filing of approved 1065s/K-1s per src/lib/AGENTS.md), tax payments, refunds, ACH/wire or provider money movement; server-side authorization only — why: user-mandated safety boundary.
- Browser tests live in e2e/*.e2e.ts (Playwright, `bun run test:e2e`), run only against QA with synthetic sessions; helpers refuse production URLs — why: keep them out of unit runs and away from real data.
- Sales uses the Operations shell for authorized Operations staff, while commercial-only Sales staff get a Sales-only menu — why: presentation must not imply wider Operations access.
- Server functions import requireSupabaseAuth from src/lib/require-auth.ts (same runtime middleware, light context type), never the generated module directly - why: the generated Database-typed context made the whole-app typecheck exceed the preview time limit.
