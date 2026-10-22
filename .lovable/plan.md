# After-signing client access, onboarding email by service level, and inbox limits

## What changes

1. **Sign, then straight into setup**
   - When a client signs a quote, proposal, RFQ or RFP, the people who signed and the client's other contacts get access to the client app right away. They don't wait for an invitation.
   - The thank-you screen after signing shows a **Sign in and start setting up your fund** button. It opens Fund Setup, and the new fund draft is filled in from the signed quote: fund name, the services picked and the service level.
   - Harmonious's approval of the statement of work and the invoice work the same as today. Setup can begin before Harmonious approves, but launching the fund and anything involving money keep their current checks.

2. **Paid service level (Core, Plus, White Glove, Institutional)**
   - Once the fund's paid level is active (that is, paid, under the current rule), the client's signers and fund managers automatically get one onboarding email. It includes the sign-in link, the next setup steps and their Harmonious contact.
   - The email is sent once per person per fund, and every send is recorded.
   - Investor onboarding opens for that fund: managers can create investor links and send invitations, and investors can go through About You, Verification, Sign and Fund.
   - Fund launch rules and closed-fund blocks stay exactly as they are.

3. **Self Serve**
   - There's no automatic onboarding email. Clients can still sign in and set up the fund themselves.
   - Investors can still onboard. Fund managers create the links themselves, as Self Serve allows today.
   - In the Inbox, clients and their investors can only message **Harmonious Operations** (the general inbox). The Sales team and dedicated-representative options are hidden, and the server turns them down too.
   - Conversations already open with Sales or a representative stay readable but are locked to new replies. They show a note pointing to Operations.

## Technical details
- Sign hook in `src/lib/sales-documents.server.ts`: after the SOW is signed, give client contact access through the existing client contact / portal-access path. Then create or return a fund-request draft through the existing `submitFundRequest` engine, set to "draft" with the quote's level.
- Onboarding email: a new `fund-onboarding-welcome` app-email template. It's sent by the server function that turns the level to active (`resolveLevelOnSubmit` → active paid). The idempotency key is `fund-onboarding-<offeringId>-<userId>`, and the existing `maybeSendClientWelcome` pattern is reused.
- Inbox: a channel policy helper `allowedInboxChannels(serviceLevel)` returns `["operations"]` for self_serve and every channel otherwise. It's enforced in the start/reply server functions and used by `unified-inbox.tsx` to filter the options. For investors, the level comes from the fund of their onboarding.
- Tests: `allowedInboxChannels`, and that the email is sent only when the level is paid and active, once per person.
- `AGENTS.md`: one rule saying the inbox channel and onboarding email depend on the fund's service level through the shared helper.

## Assumptions to confirm
- "Paid SLA" means the paid level is active (paid), not just picked on the quote.
- On Self Serve, investors can still onboard. Only the automatic email and extra inbox channels are left out.
