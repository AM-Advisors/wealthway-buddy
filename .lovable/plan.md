# Client Home dashboard + full "Launch a new fund or SPV" form

## 1. Home dashboard (new first item in the client sidebar)

A Home page for the client account (separate from Settings), showing:
- Totals: funds, open to investors, in setup, investors, committed, funded (bank-matched only).
- "New fund requests": each request with its status and "Harmonious — pending" steps.
- Setup progress per fund (completion %) with a link into each fund.
- What's waiting on you: unsigned sign-offs, open invoices, document approvals.
- Recent updates from Harmonious (existing fund progress feed).
- Quick actions: Launch a new fund or SPV, Open Cap Table, Settings.

Settings keeps its current Overview; sign-in lands on Home.

## 2. Launch a new fund or SPV: a guided form under Funds

The Funds button opens a new step-by-step form (inside Funds, not Settings) that follows the same sections as Harmonious Operations' Fund Setup:

1. **Fund Details**: fund or SPV, fund type, fund name, investment/asset type, target raise, minimum investment, expected close (calendar), bank or custodian, counsel, auditor, tax preparer (Harmonious or someone else).
2. **Entity & EIN**: legal name, structure (picked for you), jurisdiction, already formed? (date formed), has an EIN?, optional uploads: formation document, certificate of formation, IRS EIN letter.
3. **Offering & Economics**: exemption (506(b), 506(c), Reg CF, Reg A, Reg A+) with the matching "Who can invest" rules, management fee and carry/promote as % or $, preferred return, GP commitment, fund term/investment period (funds only).
4. **Classes**: one or more classes with dropdown terms or Not applicable.
5. **Offering Documents**: upload any you already have (subscription, operating/LPA, PPM, side letters), or ask Harmonious to prepare them from templates.
6. **Banking**: use Harmonious-coordinated bank setup or provide your bank name; no account or wire numbers are collected here.
7. **People**: fund manager(s) and signatory, picked from your account's people or added.
8. **Services**: main package ticked automatically from the structure and exemption, plus add-ons.
9. **Review & send**: summary of all sections with edit links.

The form saves a draft as you go and can be finished later.

## 3. What happens when it's sent

- **The new fund shows up in the Funds tab right away**, marked "Requested — Harmonious reviewing". It is closed to investors. Its fund page shows the answers and Harmonious steps as "Harmonious — pending".
- **Harmonious Operations is told it's a new fund**:
  - It appears in the Operations Requests queue and Funds "Waiting now", tagged New fund request.
  - The client's assigned Operations and Account Manager owners get an in-app update and email (falls back to the Operations inbox when nobody is assigned).
- When staff open it, Fund Setup is already filled in from the client's answers; every pre-filled value is marked "From client request" and staff still confirm, approve and launch as today (second-person approvals unchanged).
- The usual duplicate-name check runs; a likely match goes to Harmonious review instead of creating a second fund.
- Nothing is filed, paid, or sent to investors automatically.

## Technical details

- Routes: `client.home.tsx` (Home), `client.funds.new.tsx` (wizard); Funds button and Home quick action link to `/client/funds/new`. Sidebar (company + fund manager): add Home `/client/home` first; company workspace landing changes to `/client/home`. Update navigation tests.
- Server fns in new `src/lib/client-fund-request.functions.ts`: `saveFundRequestDraft`, `submitFundRequest`, `getClientHome`. Membership re-checked server-side (client main contacts/approvers).
- Submit reuses existing pieces: inserts a closed `offerings` row (reusing `submitFundIntake`'s slug, fee seeding, pricing snapshot and SOW-linking logic, refactored into a shared server helper instead of duplicated), a `client_fund_intakes` row with the full section answers, and a `client_intake_requests` row (intent launch_fund/launch_spv) so it lands in the existing staff queue. Creates `fund_setups` and pre-fills section drafts marked source=client_request; never sets statuses to complete.
- Uploads go to the existing offering document/formation upload paths as unapproved versions.
- Ops alert via the existing harmonious-team owner lookup + existing notification/email templates (new `new-fund-request` template); `contract_audit_events` entry.
- Remove the one-fund-per-client limit only for this new path; the legacy first-fund intake stays as is.
- Typecheck, unit tests for request→setup prefill mapping, browser pass once a client-linked test sign-in is available.
