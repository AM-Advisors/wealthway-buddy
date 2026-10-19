# Client self-service: audit, then open up

## Step 1: Audit (no changes)
I'll go through every client and fund-manager page in four areas and list each step that still waits on Harmonious:
- **Fund setup and launch**: formation details, registered agent, EIN, banking info, documents, launch.
- **Investors**: adding, inviting, editing, personal links, close and reopen, tracking.
- **Documents and signing**: uploads, template approval, signing order, sending for signature.
- **Team and account**: inviting teammates, roles, branding, billing settings.

For each step you'll get:
- what the client sees today
- why it waits on Harmonious
- one of three labels:
  - **Can open up**: no safety rule applies.
  - **Partly**: the client can prepare it and Harmonious only does the final protected part.
  - **Must stay with Harmonious**: covered by your standing rules, which are moving money, filings, tax payments, identity/KYC/AML decisions, pricing and approval of others' work.

You'll get the list as a short table in chat, and you choose what to open.

## Step 2: Open up the steps you pick
- Each chosen step uses the existing shared screens and engines (fund setup form, fund request engine, investor engines, client self-serve), so client and Harmonious screens don't drift apart.
- The server keeps checking permission on every step: a client can only act on their own funds and team.
- Every self-service action is recorded in history with who did it and when.
- Where a step changes something an investor has already signed or funded, the current second-person approval stays.
- I'll update the Help Center articles for each step that changes.

## What won't change
- No automated filings (except the approved IRS e-filing of 1065s/K-1s), tax payments, refunds, or money movement.
- Identity, KYC and AML results still come only from the verification provider or Harmonious review.
- Pricing and payment gates stay as they are.
- Client and Operations screens stay separate.

## Technical details
- The audit uses read-only exploration of the client and manager routes, `self-serve.server.ts`, the `ops-capabilities` and approval paths, and the existing tests.
- Changes extend `self-serve.server.ts` and the shared engines, and add server-side scope checks (fund_managers / client_users). They also add a focused unit test per opened rule and record the change in AGENTS.md.
