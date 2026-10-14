# Slack alert for every submission, tagging the assigned Operations person

Whenever a client, fund manager or investor submits something, a message goes to **#operations** in Slack. It @-mentions the Operations team member assigned to that client or fund (for ROAS, Jenner Smith).

## What triggers an alert
- **Fund manager setup:** Fund details, Fees & team, Bank / wire, Documents (for example the Operating Agreement).
- **Investor onboarding:** questionnaire submitted, subscription documents signed, "I've sent my wire" reported, identity check finished.
- **Client requests:** new fund or SPV requests, service requests, close requests, change requests and messages to Operations.
- **Internal work submitted for approval:** a staff member sends something for review, such as accounting batches, documents or fee changes. The alert tags the assigned Operations person, never the person who submitted it.

## What the message looks like
```text
@Jenner Smith  New submission - ROAS Hedge LP
Fund manager submitted: Document - Operating Agreement
Submitted by: Ross Mahoney · Oct 14, 12:06 pm
[Open in Harmonious]
```
- It shows only the item name, fund, who submitted it and a link.
- It never includes amounts, tax IDs, bank details, ID documents or file contents.
- If no Operations person is assigned, it tags the account manager instead. If neither is assigned, it says "No Operations owner assigned."
- Alerts never block the submission. If Slack is down, the submission still saves and the failure is logged.
- Repeat clicks within a few minutes send only one message.

## Who gets tagged
- The Operations person comes from the fund's Harmonious Team, which can override the client's team.
- Slack people are found by their Harmonious work email. If the Slack connection can't look up emails, an Operations Team page gets a "Slack member ID" field per staff member as the backup.

## Then
After this, I'll continue the approved fund page redesign: the 5 tabs + More, the setup stepper and the tappable numbers.

## Technical details
- New `src/lib/ops-slack-notify.server.ts`: `notifySubmission({ kind, offeringId?, clientId?, title, submittedBy, url })`. It resolves the owner through `loadFundTeam` / `loadClientTeam` (operations, then account_manager). It finds the Slack ID through the cached `users.lookupByEmail` call, with fallback to a new nullable `profiles.slack_user_id` column. It posts with `chat.postMessage` to the existing #operations channel through the current Slack connection. Repeats are blocked through a small append-only `ops_slack_notifications` table with a unique key per item and submission time bucket; the migration includes GRANTs and staff-only RLS.
- Calls are added after the successful write in `fund-manager-submissions.server.ts` (submit), `investor-onboarding.server.ts` (questionnaire submit, signing complete, `investorReportsFundsSent`), the Didit webhook completion, `client-fund-request` / `fund-requests.server.ts`, close requests, and the shared approvals submit path.
- `fund-request-notify.server.ts` reuses the same helper so there is one Slack sender.
- If `users.lookupByEmail` returns `missing_scope`, I'll ask you to reconnect Slack with `users:read.email`. Until then, the fallback ID field is used.
- Unit tests cover owner resolution, the fallback order, the content allow-list (no sensitive fields) and repeat suppression.
