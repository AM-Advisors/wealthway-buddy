# Record ROAS's Q3 2026 payments and update the Q3 summary

## What was paid (as I understand it)
On **August 21, 2026**, ROAS paid for **2 entities** (the two already on the platform), **$7,500 per entity for the quarter**:

| Per entity | Amount |
|---|---:|
| Q3 financials | $2,500 |
| Platform onboarding (getting the entity onto the platform) | $2,500 |
| Maintenance by Harmonious | $2,500 |
| **Per entity total** | **$7,500** |
| **2 entities total, paid 08/21/2026** | **$15,000** |

The third entity isn't on the platform yet, so nothing is recorded as paid for it. Its charges can be invoiced once it's added.

## What gets done
1. **Record the paid invoices** under ROAS → Harmonious fees using the existing "migrated billing" entry (CEO/CRO only). There will be one paid invoice per entity, with three line items each, marked **Paid 08/21/2026**, period July 1 – Sept 30, 2026.
2. **Approval:** a second person approves each entry before it counts. As a Super Admin, you can approve your own with a reason, and that reason is logged.
3. **Commissions:** the entries are not sent to commissions automatically. You can send them over afterward, and that step still needs its own approver.
4. **Q3 summary for ROAS:** a read-only breakdown showing financials, platform onboarding and maintenance per entity, plus received versus outstanding. The annual platform fee ($3,125 per entity per year) shows separately and only when it is actually billed.

## Rules kept
- No money is moved and no client emails are sent. These are records of payments already received.
- Existing invoices, quotes and signed agreements stay as they are.

## Please confirm
- Is it **$7,500 per entity ($15,000 total)**, or **$7,500 total** for both entities?
- Which two entities are they (for example the LP and the GP)?

## Technical details
- Use migrated-billing.server.ts to record the past invoices and payments for the ROAS client, with fund links set on each entity's offering. The entries are idempotent on (client, entity, period, line).
- Maker-checker uses the existing approval engine. The recorder can't also push to commissions.
- The summary comes from canonical invoice and payment reads. It is display only.
