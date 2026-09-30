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
- Never automate filings, tax payments, refunds, ACH/wire or provider money movement; server-side authorization only — why: user-mandated safety boundary.
