# Fund live email at launch

## What people will see
When **Launch fund** succeeds, every fund manager and fund team member on that fund gets a Harmonious-branded email:

- Subject: "Your fund {Fund name} is now live"
- Confirmation the fund is open for investor onboarding, with the launch date
- The fund's onboarding link (short branded link) and a "Copy and share" note
- Step-by-step instructions for onboarding investors:
  1. Share the onboarding link, or add investors one at a time from My Funds, Investors, Add investor (each gets a personal invitation)
  2. What investors complete: About You, Verification, Sign, Fund
  3. Where to track progress and approve admissions (Investors and Approvals tabs)
  4. Wire instructions follow the fund's countersign timing choice
  5. Who to contact with questions (Operations inbox)
- Button: "Open your fund" to the fund's page on app.harmonious.co

Launching is never blocked or undone if an email fails; the launch still completes and the failure is logged.

## Recipients
- All fund managers on that exact fund, plus fund teammates who accepted an invitation to that fund.
- One email per person, sent once per launch (relaunching the same fund does not resend).
- Unverified or removed people are skipped. No investors are emailed.

## Technical details
- New template `src/lib/email-templates/fund-live.tsx` registered in `registry.ts`, using the shared steps list and branding (navy/teal, Rubik/Poppins, no dashes, no outside platform names).
- New `src/lib/fund-live-notify.server.ts`: reads recipients from the fund's managers/team records, sends via `sendTemplateEmail` with idempotency key `fund-live-{setupId}-{userId}`; treats suppressed recipients as skipped.
- Called at the end of `launchFund` in `fund-setup.server.ts` after the `fund_launched` event, wrapped so errors never fail the launch; records a `fund_live_notified` event with counts (no addresses).
- Tests: recipient selection (managers + accepted team only, deduplicated, no investors) and idempotency key stability.
