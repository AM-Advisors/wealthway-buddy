# CRO access for McKay and a CRO dashboard

## 1. McKay's CRO access (mckay@harmonious.co)
- There's no account for mckay@harmonious.co yet, so I'll create a pending CRO invitation for that address. His fund-manager account (mckay@storybookvc.com) stays exactly as it is.
- The first time McKay signs up or signs in with mckay@harmonious.co, the existing invitation process gives him the CRO role. He's also marked as an Individual staff account, which privileged roles require, and skips client identity checks like other staff.
- He gets an invitation email with the sign-in link (staff invite template).
- On the Roles page, his pending invitation shows until he accepts it.

## 2. CRO dashboard (Sales → CRO, /sales/cro)
A single home page for the CRO, Sales Manager and Super Admin roles:
- **Team overview:** revenue closed and pending, win rate, outreach count and connect rate, each against its target, with a period filter (day, week, month, quarter, year or custom dates).
- **Per-member progress:** a table of each Account Executive and BDR showing stage counts (outreach through contract won or lost), revenue closed and pending, progress to target, and last activity. Click a row to open that rep's existing page.
- **Pipeline funnel:** a bar from outreach to won, plus a circle chart of outreach versus connected.
- **Quoting engine panel:** quotes waiting for CRO approval, with Approve and Reject buttons (pricing rules unchanged), quotes sent and awaiting signature, recently signed quotes and their hand-off status (draft fund created and Operations notified), and a "New quote" button.
- **Attention list:** stalled deals (no activity for 14 days), overdue "contact later" deals, and quotes about to expire.
- In the sidebar, the CRO page appears first under Commercial for these roles, and McKay lands on it after signing in.

## 3. Access fixes carried over from the open list
- A Sales Manager with no direct reports sees only their own data, not the whole team. The CRO, CEO and Super Admin see everyone.
- Managers see everyone below them in the reporting chain, not just their direct reports.
- BDRs can no longer move deals beyond Meeting set, so they can't mark deals Lost.

## Technical details
- The invitation is a `staff_invitations` row (role `cro`), claimed by the existing `sync_roles_and_invitations` process. I'll confirm it handles `cro` and records the account classification as `individual`, and patch that process if it doesn't.
- New `croDashboard` server function (in sales-hub.functions) that reuses the existing salesActor, rep metrics and quote lists. The server allows only CRO, Sales Manager, Super Admin and CEO.
- New route `src/routes/_authenticated/sales_.cro.tsx` with its own page title and description. Charts use the existing chart components.
- Reporting-chain visibility uses a recursive lookup over the sales reporting lines, and `canMoveToStage` is tightened.
- Verify with unit tests for the scope and stage rules, then a preview check of the page signed in as the current super admin.
