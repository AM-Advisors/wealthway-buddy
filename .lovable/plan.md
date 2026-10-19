# Compliance schedules: richer reports, outside recipients, Compliance menu, signed-in test

Recurring compliance reports already exist. Each one is prepared on its date and sent only after a different team member approves it. This plan expands them as you asked.

## 1. Report contents
Each report adds four sections. Each section shows counts plus a short list of fund and party names (names only, never identity numbers, documents or bank details):
- **KYC/AML status**: identity checks that are pending, in review or declined, from the Didit records already on file.
- **Filing deadlines**: Form D, Blue Sky and tax deadlines that are upcoming (next 30 days) or overdue, from the existing compliance items.
- **Fund deadlines**: closing dates, capital call due dates and launch dates in the next 30 days.
- **KYB missing info**: entities waiting on Legal, with how long each has been waiting.

When setting up a schedule, you can turn each section on or off. Older schedules keep their current contents until edited.

## 2. Approvers
No change: any staff member except the person who set up the schedule may approve. Super Admin self-approval with a logged reason still applies.

## 3. Outside recipients
- Outside addresses (for example fund counsel) can be added.
- Each outside address needs a separate confirmation tick and a reason when it's added. The approver sees outside recipients highlighted before approving.
- Outside recipients get a summary version (counts only, no names). Harmonious addresses get the full version.
- Every outside address is permanently recorded in the delivery history.

## 4. Compliance menu
"Compliance schedules" also appears under the Compliance dashboard menu for Compliance and Legal staff. It stays under Accounting & Reports too. Seeing the menu item grants no access by itself.

## 5. Signed-in test
Using a test session on preview: create a schedule, trigger a report, confirm the creator cannot approve it, approve it as a second account, and confirm it appears in the delivery history. If no second test account is available, I'll report that step as unverified.

## Unchanged
Reports never file, pay, or move money. Nothing sends without approval.

## Technical notes
- `compliance-schedules.server.ts`: extend `buildSnapshot` with section builders; add `sections` jsonb + `outside_recipients` (address, reason, confirmed_by) on `compliance_report_schedules` (additive migration). `recipientAllowed` becomes an internal/outside classifier. Redacted snapshot for outside recipients.
- Model + tests in the existing v25 test file: section toggles, outside-recipient confirmation is required, redaction drops names, creator can't approve.
- `ops-sidebar.tsx`: add the item to the regulatory submenu when leader or compliance/legal.
