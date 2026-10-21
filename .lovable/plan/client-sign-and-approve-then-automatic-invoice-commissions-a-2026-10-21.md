# Client sign and approve, then automatic invoice, commissions and wire/ACH instructions

## What the client will see
1. **Review & accept page:** the client opens the email link (or the link in their portal) and sees the approved quote, proposal, RFP or RFQ. If they're signed in, it opens in their portal. If not, a secure single-use link opens a page that shows only that document.
2. **Sign & approve:** the client types their full name and title, ticks "I approve and agree," and signs. We record the date, time, version, signer and evidence (IP, browser, document fingerprint). Signed versions can't be changed. A later change makes a new version that needs a new signature.
3. **Choose how to pay:** card, wire or ACH.
   - **Card:** uses the existing card checkout, which is still in test mode.
   - **Wire or ACH:** the page shows Harmonious's payment instructions and the invoice number to use as the reference. The instructions appear only to the signed-in contact or valid link-holder for that invoice. They're never in the email and never cached, and every view is logged. Partial account numbers stay masked until the client clicks "Show full details", which is also logged.
4. **Confirmation:** the client sees "Signed — invoice INV-xxxx issued" and gets a confirmation email with a link back to the invoice. The email has no bank details.

## What happens automatically
- **Invoice:** signing creates one invoice from the signed version's line items, priced only from the approved quote. It's linked to the client, the fund (if one is attached), the quote and the document. Signing twice can never create two invoices. The invoice is issued straight away because its prices already passed the quote's second-person approval. Staff can still void it and reissue a corrected one, never edit it.
- **Commissions:** the commissions tab will include invoices created from signed quotes, proposals, RFPs and RFQs. It records every party, including AE, BDR, Sales Manager, CRO and CEO, at the rates in effect. Commission shows "earned" once the invoice is marked paid and "pending" before then. Nothing is paid out automatically.
- **Sales hand-off:** the deal moves to Closed / Won, the owner and anyone copied get a notice, and the existing Operations hand-off runs.
- **Recorded only:** Harmonious never pulls money or starts a wire or ACH. Staff mark the invoice paid when the money arrives, as they do today.

## What Harmonious staff need to set up once
- **Payment instructions:** a new screen under Billing, "Payment instructions," for Harmonious's wire and ACH details: bank, account name, account and routing numbers, SWIFT, bank address and beneficiary address. One person enters them and a different person approves them (Super Admins may self-approve with a reason). A change creates a new version, and the old one is kept. Clients see only the current approved version. Until one is approved, clients see "Contact your Harmonious representative for payment details."
- **Real bank details:** I don't have Harmonious's real bank details. Someone at Harmonious has to enter them on that screen.

## Rules kept
- **Who can sign:** only the recipient contact, or someone from that client organization, can sign. Staff can't sign for a client.
- **Approval first:** only an approved, sent version can be signed.
- **Money:** Harmonious never moves money and never charges anyone automatically.
- **Wording:** no outside platform names appear in client-facing text.

## Technical details
- **Database changes:**
  - `sales_document_acceptances`: an append-only table for signer name and title, version, content hash, IP/UA, a token hash and `invoice_id`, unique on the document.
  - `invoices.sales_document_id` and `invoices.sales_quote_id`, each with a unique partial index for idempotency.
  - `harmonious_remittance_versions`: wire/ACH fields, `status` draft/approved/retired, `prepared_by`, `approved_by` and a reason; vault-encrypted account numbers; an immutability trigger on approved rows.
  - `remittance_view_events`: append-only.
  - Each table gets its GRANT, RLS and staff-only policies; all reads go through server functions.
- **Server, sales documents:** `acceptSalesDocument` in `sales-documents.server.ts`. It verifies the signer (session client membership, or an HMAC token tied to doc, version and recipient, single-use) and checks status sent/approved. It writes the acceptance, then calls a new `createInvoiceFromAcceptance`, which reuses invoice creation and issue logic in `invoices.functions`/`.server`, with idempotency key `salesdoc:{id}:{version}`.
- **Server, quotes:** the same flow for standalone quotes: `acceptSalesQuote` with idempotency key `quote:{id}:{version}`.
- **Payment instructions:** `getInvoiceRemittance(invoiceId)` checks client access to the invoice, logs the view, returns masked details by default, and returns the full numbers only on reveal with `Cache-Control: no-store`.
- **Commissions:** `commissions.server.ts` is extended to match invoices by `sales_quote_id` and `sales_document_id` (resolving through the doc's linked quote), not just `sow_id`. The existing rate versions and parties stay as they are.
- **Pages:**
  - Public token page `src/routes/accept.$token.tsx`.
  - Portal page `src/routes/_authenticated/portal.accept.$kind.$id.tsx`.
  - Staff page `src/routes/_authenticated/ops.billing.payment-instructions.tsx`.
  - Pay-method selector on the invoice view.
- **Records:** add an AGENTS.md rule for client acceptance, then automatic invoice, with remittance shown only via an audited server read.
- **Tests:**
  - Signing twice creates exactly one invoice.
  - Commission rows include acceptance-created invoices with the correct parties.
  - Staff cannot sign for a client.
  - Unapproved or unsigned remittance details are never returned.
