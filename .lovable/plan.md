# Investor onboarding, signed in, with "Start my own fund"

## The flow

```text
Create account -> Verify email -> Complete profile -> Investment steps (About You, Verification, Sign, Fund)
                                                   \-> optional: Start my own fund -> Sign MSA -> Pay $2,500 -> Fund setup checklist
```

1. **Create account and verify email.** This uses the existing sign-up and email verification. Once the email is verified, the account connects automatically to any invitation or investment waiting under that email, and opens it.
2. **Complete profile.** A single "Your profile" step for the person behind the login: name, phone and address. Investment details (legal name, tax ID, owners, signers) stay on the investment profile, because the login account is never the investing party. The step is skipped when a fund manager or Harmonious already filled these in, and shows only what's missing.
3. **Investment checklist.** Investors see the four existing steps, About You, Verification, Sign and Fund, as their checklist with a status for each. The Master Services Agreement (MSA) is never shown or required for investors.
4. **Start my own fund.** The investor home gets a "Start your own fund or SPV" card.
   - **Set up the business:** they enter the business name, which creates their own client organization with them as owner. Investor access is unchanged.
   - **Sign the MSA:** the MSA becomes required now, and only for that organization.
   - **Pay $2,500:** card payment through the existing "Add Fund or SPV" form. The request is sent only after the card company confirms payment.
   - **Fund setup checklist:** once paid, the normal fund setup checklist and readiness score open, the same ones fund managers use today.
5. **Fund managers** keep today's order: the MSA comes first, then fund setup.

## Rules
- The MSA applies only to people who belong to a client organization, meaning fund managers or someone starting a fund. Investors-only are never asked.
- The $2,500 is charged once per fund request. A paid request isn't charged again, and staff mode still skips payment only after the existing server check.
- Starting a fund doesn't grant Harmonious, money or verification authority. Everything is checked on the server and recorded in history.

## Verification
- Walk the whole flow on the isolated QA copy with a synthetic investor: sign up, verify, complete the profile, see the investment checklist with no MSA, start a fund, sign the MSA, pay with test card 4242, then see the fund setup checklist.
- Add tests: an investor-only account is never asked for the MSA; a new client organization requires the MSA before payment; the fund request isn't sent before payment is confirmed; the fee is $2,500.

## Technical details
- Add a profile completeness check (person name, phone and address) as a portal step in `portal-gate` after access, prefilled from `persons`.
- Add an `investor.start-fund` route that calls a server function. It creates `clients` plus a `client_users` owner row for the caller (one per user, idempotent) and redirects to `/client/funds/new`. The existing `MsaGate` under `/client` enforces sign-before-pay, and `FundRequestEngine` (mode client) handles the $2,500 checkout and the paid-only send.
- `getMsaGateStatus` is unchanged: no client membership means no gate. A test locks this in.
- Show the four-step status on the investor home using the existing per-step statuses.
