# Fix: "This fund is not open for investor onboarding yet" on the live site

## Diagnosis (confirmed)

- The error comes from the fund launch gate in `launchedOffering` (src/lib/investor-onboarding.server.ts).
- Fund `9b19bb9f` (Chapter 2 area) has `launch_state = not_ready` and no launch date — correct, it's still in setup.
- The current code already allows saving an investor to a fund still in setup: `createInvestor` (src/lib/investor-record.server.ts) has no launch gate, and the comment "saving a record never requires a launched fund (nothing is sent). Invites stay launch-gated" documents the rule. That change landed today at 21:01 UTC.
- The failing page is on the **published** site (ops.harmonious.co), which is still running the older build from before that fix. No database trigger blocks the insert — verified.
- Invitations remain launch-gated by design; only the record save was freed.

## Plan

1. Publish the app so the live site picks up the already-built fix (save investor records pre-launch; invites stay gated until launch).
2. After publish, verify on the live site: open the same fund's Investors tab, save a test investor (Brian Loftus can be retried), confirm the record saves and no invite is sent.
3. If the error still appears after publishing, investigate further (it would mean a second gate exists in the deployed path).

## Technical details

- No code changes needed — the fix is commit `1d7c3d15` (21:01 UTC today); production predates it.
- Publish via the standard publish action; verification uses the live URL https://ops.harmonious.co/manager/fund/9b19bb9f-b9a8-489c-b96f-6940c04d105c/investors.
