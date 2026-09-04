# Connect project to GitHub (AM-Advisors/OnboardingHarmonious)

## Important constraint

Lovable creates a **new** GitHub repository when you connect — it cannot push directly into your existing `AM-Advisors/OnboardingHarmonious` repo. Two workable paths:

## Option A — Recommended: Let Lovable create the repo, then move it

1. In the editor: Plus (+) menu in chat input → **GitHub** → **Connect project** → authorize the Lovable GitHub App on the **AM-Advisors** organization.
2. Click **Create Repository** — Lovable creates a new repo under AM-Advisors with the full project code and enables real-time two-way sync.
3. In GitHub, either rename the new repo to `OnboardingHarmonious` (if the existing one is empty/disposable) or transfer/replace the old repo.
4. From then on: edits in Lovable push automatically; pushes to GitHub sync back into Lovable.

## Option B — Keep the existing repo as-is

1. Do Option A steps 1–2 to get a synced repo.
2. Locally: clone both repos, set the existing `OnboardingHarmonious` repo as a remote on the Lovable-created clone, and push — preserving the old repo's history/URL.
3. Continue working in Lovable; sync flows through the Lovable-created repo.

## What I need from you

- Confirm which option you prefer (A is simplest if the existing repo has nothing you need to keep).
- You'll perform the GitHub authorization step yourself in the editor — it requires your GitHub login and can't be done by me.

## Notes

- Two-way sync is real-time once connected; branches can be switched from the editor.
- Secrets (API keys) never sync to GitHub — they stay in the project's server environment.
