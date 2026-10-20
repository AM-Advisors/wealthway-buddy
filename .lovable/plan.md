# Fix "Harmonious is setting up verification" and alert the team when investors get stuck

## Why it happened
Calvin's CORPS Erebor investment was added by the fund manager directly. The Start Verification button still depends on an older-style "application" record that only exists when an investor applies through the legacy path. Calvin's investment has none, so the button stops with "Harmonious is setting up verification…" even though nothing is actually being set up and nobody is told. 237 open investments are in the same state, so most manager-added investors will hit this.

## Fix
1. When an investor presses Start Verification and no application exists, create it automatically for that investor and fund (once only, safe on repeat clicks), then open identity verification right away. Calvin can continue immediately.
2. Catch-up: create the missing record for the 237 open investments so nobody else sees the message. Nothing else on those investments changes; signatures, money and verification results are untouched.
3. Replace the misleading wording: if verification still can't start, the investor sees "We couldn't start verification. Harmonious has been notified and will follow up." and a Try again button.

## Alerts when an investor is blocked
Whenever an investor hits a step that can't start (verification, signing, funding instructions):
- **Slack #operations**: tags the fund's assigned Operations person (account manager fallback), with investor name, fund, step, and a link to the investor record. No tax IDs, amounts, bank details or documents.
- **Email to the fund team**: the fund's managers get a short branded email "An investor needs help with Verification" with a link to the investor page.
- Repeat clicks within an hour send only one alert per investor and step. Alerts never block the investor and failures are logged.

## Technical details
- `startInvestmentVerification` (investor-onboarding.server.ts): when no application, insert `investor_applications` row (user_id, offering_id, minimal status) under a unique (user_id, offering_id) guard, link via `touch`. Catch-up via the same helper in the daily reconcile sweep plus a one-time run.
- New `notifyInvestorBlocked({ onboardingId, step, reason })` reusing `notifySubmission` (ops-slack-notify.server.ts) with a new kind, and `notifyClientAdminsWith`/a new `investor-blocked` email template sent to each fund manager (one recipient per send, idempotency key per onboarding+step+hour).
- Tests: auto-create on missing application, no duplicate on repeat, alert dedupe, alert content excludes sensitive fields.
