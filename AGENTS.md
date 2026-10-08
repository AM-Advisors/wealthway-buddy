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
- The client fund page and the Operations fund setup page share src/components/fund-workspace.tsx (mode client|harmonious); Harmonious-only controls are gated by mode and every action keeps its own server-side check - why: one fund view that can't drift, display mode never grants authority.
- Offering Statement management fee/carry/preferred return are projections of the active fund_fee_terms row (src/lib/offering-statement.functions.ts overwrites them on read and save) - why: the statement must never differ from the fund record.
- Fund setup % and launch label come only from src/lib/fund-launch-summary.ts (tasks + launch conditions) on Fund Setup and Readiness - why: the same fund must show one number everywhere.
- Classroom articles live in classroom_articles + append-only classroom_article_versions/events (src/lib/classroom.server.ts); public pages read only published versions via src/lib/classroom-public.functions.ts, and /post/<slug> addresses never change - why: keeps Wix URLs and rankings while allowing versioned AI drafts.
- Social post artwork uses shared marketing brand font definitions and original logo asset pointers, and export waits for brand font loading — why: saved artwork must match the preview without fallback typography or distorted logos.

- Marketing, email-flow and CSA STAR rules live in src/lib/AGENTS.md - why: keeps this file within budget.