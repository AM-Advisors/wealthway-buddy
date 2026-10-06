# Sales owns MSAs and SOWs

## Goal
Sales sets up, edits, sends and manages every MSA and SOW. Operations and Account Managers stop managing them. They can only see the agreements for clients and funds they're assigned to, along with what each agreement means for those funds and clients.

## Who can do what

```text
                         See            Create/edit/send         Countersign
Sales (AE, BDR, SM, CRO) their deals*   yes                      no
Sales Manager / CRO      their team     yes + approve pricing    no
CEO / Executive          all            yes                      yes
Super Admin              all            yes                      yes
Legal                    all            review/comment           yes
Operations               assigned only  no (read-only)           no
Account Manager          assigned only  no (read-only)           no
Leadership               all            no (view-only)           no
```
*Account Executives and BDRs see agreements for clients where they're the assigned Sales owner, plus any agreements they created. Sales Managers and the CRO see their reporting team's agreements.

"Assigned" means the person is on the client's Harmonious team, or on a fund's team override, as Operations or Account Manager.

## What changes for each team

**Sales**
- The MSAs & SOWs page and SOW templates sit under Sales and become Sales' own workspace: build pricing lines, write amendments, answer client change requests, and send to clients.
- Existing rules stay the same: pricing below the standard rate still needs CEO/CRO approval from someone other than the drafter, and quotes still create matching SOWs.
- Countersigning stays with the CEO, Super Admin or Legal. Sales can't sign for Harmonious.

**Operations and Account Managers**
- A new read-only "Agreements" view, reached from their client and fund pages and from Account Management. It lists only the clients and funds they're assigned to.
- Each agreement shows its status (draft, sent, signed, countersigned, amended), the services and prices it covers, and which funds it applies to.
- It also shows what the agreement means for their work: services they're contracted to deliver, services a fund uses that the SOW doesn't cover, and unsigned or expiring agreements to follow up on.
- An unsigned agreement is shown as a follow-up item only. It never blocks fund or investor work (current rule kept).
- No edit, send or amend buttons. A "Ask Sales" button opens a task for the client's Sales owner.

**Clients**
- No change. They keep reviewing, requesting changes on and signing their agreements.

## Clean-up
- Remove the edit and send buttons for Operations, Client Success, Finance and Compliance on the current agreements page. If they have a client or fund assignment, they get the read-only view.
- Finance keeps the read-only view of all agreements for invoicing.
- Every create, edit, send and amend action keeps being recorded in the existing agreement history with who did it.

## Technical details
- `src/lib/agreements-admin.functions.ts`: replace `CONTRACT_ROLES` with Sales roles (sales, account executive, BDR, sales_management, CRO) plus executive/super_admin. Countersigning (`countersignSow`, `executeAmendment`) requires executive, super_admin or legal. Scope `listAgreementQueue` and `getAgreementDocument` per viewer with a new `agreementScope(who)` helper:
  - Sales reps: clients where `client_team_assignments.team_role='sales'` is the rep, or `created_by` is the rep.
  - Sales managers/CRO: use the reporting-line scope (`viewerScope`).
  - Operations/Account Managers: clients where they hold that `team_role`, plus funds via `fund_team_overrides`.
  - Executive, Super Admin, Legal, Finance, Leadership: all.
- Apply the same checks in `fund-sow.functions.ts`, `commercial-pricing.functions.ts` (SOW line edits), `sales-quotes.server.ts` (SOW creation from quotes), and `ops.contracts.sow-templates` writes.
- New `src/lib/agreement-impact.server.ts` + `.functions.ts`: a read-only view joining SOW lines to `client_sow_funds` and the expected services each fund uses. It flags services that aren't covered, unsigned agreements and agreements expiring within 60 days.
- New route `ops.agreements.tsx` (assigned read-only list) and an Agreements panel on client and fund pages. Add an "Agreements" item to Operations and Account Management in the sidebar. Gate the buttons in `admin.agreements.tsx` with the server's `canManage` flag.
- "Ask Sales" creates a `staff_tasks` row assigned to the client's Sales owner.
- Record the ownership rule in `src/lib/AGENTS.md`. No database schema changes are expected.
