# Review & Sign: one clear checklist, one task at a time

## Problem
The Sign page puts every task in one long scroll. Some required tasks don't appear in the app at all: "Review & certify" is missing, and Financial background was missing until the last fix. So the investor only learns what's left when **Submit subscription** fails with an error.

## What the investor will see

```text
Review & Sign                       4 of 8 done
[x] Investor questionnaire          Complete
[x] Accreditation                   Complete
[ ] Financial background            To do      ->
[x] IRS tax form (W-9)              Signed
[ ] Review & certify                To do      ->
[x] Fund fees                       Accepted
[ ] Subscription documents          1 left     ->
[ ] Submit subscription             Locked (finish 3 above)
```

- **Checklist at the top** of the Sign step. Every task required for this investment gets a row with a plain status (Complete, To do, Under review, Locked) and the reason it's locked.
- **Tap a row to open just that task.** The others stay collapsed, and completed tasks show a short summary.
- **Automatic next task:** after saving, the next unfinished task opens and the page scrolls to it.
- **Nothing hidden:** every required task, including Review & certify, has its own form in the app, so none is left only for the separate onboard link.
- **Submit at the bottom:** the button stays disabled and lists the remaining tasks by name, each one tappable. If the server still refuses, the error names the task and opens it.
- **Mobile first:** large tap targets, a sticky "X of Y done" bar, and no duplicate lists.
- The same top progress bar keeps the four main steps (About You, Verification, Sign, Fund) as they are now.

## Rules unchanged
The order of tasks, what is required, the 506(b)/506(c) handling, investor-signs-first, and all server checks stay exactly as they are. This changes only how the page looks and moves between tasks.

## Technical section
- New `src/lib/sign-step-tasks.ts`: a pure function that builds the ordered task list (key, label, state, lockedBy) from `d.requirements`, `d.documents` and fee acceptance. It uses the same requirement keys the server uses (`subscription_questionnaire`, `accreditation`, `bsa_aml`, `tax_documentation`, `certifications`, fees, `subscription_documents`, `signature`).
- New `SignChecklist` component plus an accordion wrapper in `investor-onboarding-journey.tsx`. The existing panels (QuestionnaireForm, AccreditationStep, FinancialBackgroundPanel, TaxSignPanel, FeeAcceptanceCard, document list) are reused inside it, not rewritten.
- Export a `CertificationsOnlyPanel` from `onboard-compliance-panels.tsx` (it reuses the existing CertificationsPanel) and add it to the Sign step.
- Map server "X must be completed first" errors to a task key so the right task opens.
- Tests in `src/lib/sign-step-tasks.test.ts`: task order, locking (documents stay locked until the questionnaire and tax form are done), and that Submit is blocked while any required task is missing.
