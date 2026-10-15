# Slack alert when reminder tasks are completed

When someone finishes one of the reminded tasks, post one message in #operations tagging **both** the Operations person and the Account Manager responsible for that client/fund.

## Tasks that trigger an alert
- Form SS-4 signed
- Operating Agreement, Subscription Agreement, LLOA and other fund documents: each signer signs, plus a "fully signed" alert when the last signer finishes
- Master Service Agreement signed
- W-9 / W-8 uploaded
- Investor questionnaire submitted

## The message
- Tags the Operations owner and the Account Manager (both if both are assigned; whichever exists otherwise; "No owner assigned" if neither)
- Says what was completed, the fund or client, who completed it, when, and an "Open in Harmonious" button
- Never includes SSNs, tax IDs, bank details, amounts or ID data
- Repeat clicks within 5 minutes send only one message
- If Slack is down, the signing still succeeds — the alert is best-effort

## Technical details
- Extend `src/lib/ops-slack-notify.server.ts` (the single sender): add `notifyCompletion()` reusing the allow-list, dedupe table `ops_slack_notifications`, and Slack ID lookup; add `pickOwners()` returning operations + account_manager (existing `pickOwner` stays for submission alerts) and a "Completed - …" message variant. Unit tests in `ops-slack-notify.test.ts`.
- Call it after the successful write in: SS-4 sign (`ss4-request.functions.ts`), fund file signing (`fund-file-signing.functions.ts`), MSA acceptance, W-9/W-8 upload and questionnaire save (`investor-onboarding.server.ts`).
- Update the Slack rule in `src/lib/AGENTS.md` to cover completion alerts.
