# Automatic commission payouts after a signed SOW

## Before anything is built
Right now the platform is built around one firm rule: it never moves money by itself. This change reverses that rule for one case only, commission payouts. Approving this plan counts as your written approval for that one case. Every other money path stays manual: refunds, tax payments, client money and fund wires.

The platform can't move money yet because no bank or payments service is connected for sending payouts. The first step is connecting your business bank's payment service, using its own key, which is stored securely. Nothing is sent until that's done and a test payment works.

## How it will work
1. The client signs the SOW. The quarter's payout shows on Commissions as **Expected**, as it does today.
2. The client pays the invoice. The payout becomes **Scheduled** for the quarter-end date.
3. Three business days before quarter-end, Finance gets a **Payout batch** listing every rep, amount, invoice and the rep's bank account (last four digits only).
4. **Two people must approve the batch.** The first is Finance; the second is the CEO or CRO, and nobody can approve their own payout. A Super Admin may self-approve with a required reason, as today.
5. On the payout date, the approved batch is sent to the bank automatically. Each payout is recorded as **Sent**, then **Paid** or **Failed** once the bank confirms. It is never sent twice.
6. The Commissions page and the payout calendar show the status, the bank confirmation number and a full history for each payout.

## Who gets paid
- Payouts go to the **sales rep's** bank account. Commissions are owed to reps, not clients.
- Each rep adds their own bank account, and a second person checks it before it can receive money, using the same rules as fund banking today.
- A payout to a rep with no verified account stays on hold.

## Safety limits
- A per-payout and per-batch maximum (to be set by you), with a daily total cap.
- Automatic sending is off by default. Only a Super Admin can turn it on or pause it, with a logged reason, and Pause takes effect immediately.
- If a payout fails or is reversed, it goes to Finance's review; it is never retried automatically.
- Corrections create a new record. The original is never edited.

## What you'll need to provide
- Which bank or payments service to send from (it must offer a payments API).
- Its key for that service.
- The per-payout and daily maximums.

## Technical details
- New tables (append-only, with RLS and grants): `rep_payout_accounts` (with maker-checker verification), `commission_payout_batches`, `commission_payout_transfers`, and a per-transfer event log. The idempotency key is `queue_row_id`.
- The batch is built from `commission_payout_queue` rows with status `scheduled` and `due_on` equal to quarter-end, using the canonical amounts of record.
- Release goes through a dual-approval server function using the existing ops-capabilities money path (`capabilitiesFor(roles, { moneyPath: true })`). The approvers must be distinct from each other and from the payee.
- The daily cron route `/api/public/hooks/commission-payouts` checks a server-only secret, sends only approved batches when the kill switch is on, and records provider IDs. A provider webhook verified by signature marks payouts paid or failed.
- Update the project rule in `AGENTS.md` and project memory to name this single approved exception, alongside the existing IRS e-filing exception.
- Tests cover batch eligibility, the self-approval refusal, the caps, idempotency, and the kill switch.
