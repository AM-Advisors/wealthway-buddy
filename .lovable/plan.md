# Quotes, proposals, RFPs and RFQs: refreshed screens and a personal review-and-sign link for each signer

## What changes

### 1. Staff screens (the Quotes page and the Proposals, RFPs and RFQs page)
- **One layout for every kind.** Each record has the same header: kind, title, client, version and owner, plus one progress bar:
  ```text
  Draft -> Approved -> Sent -> Signed -> SOW -> Invoice -> Paid
  ```
  Each step shows its date and who did it, taken from the history already recorded.
- **"Recipients & signing" panel.** This replaces scattered buttons. It shows:
  - the client's team, who can sign and anyone CC'd;
  - for an existing client, a tag saying the services are being added;
  - for each person, whether they've opened, signed or are still waiting.
- **One link per person.** Next to each signer there's a **Copy sign link** button: a personal web address that opens the review-and-sign page for that person. Non-signers get a **Copy review link** button, which opens a view-only page. Copying a link is saved in history, and links can be copied before or after the email is sent. Only approved versions get links. A newer approved version makes older links show "A newer version is available."
- **Linked records card.** It shows the linked quote, the SOW and its status (Draft, Proposed or Executed), the invoice number with paid or unpaid, and the deal. Each one is clickable.
- **Preview and actions grouped.** Preview, Submit for approval, Approve, Send and Export sit together in one action bar. Buttons show only when that step is allowed.

### 2. Client review-and-sign page (the link they click)
Everything happens on one page, with no downloads or outside sites:
1. **Overview**: who it's from, your Harmonious contact, version and date.
2. **What we handle**: only the services picked on the quote.
3. **Pricing**: the line items and total.
4. **Terms**: the proposal's own sections. The Master Services Agreement appears as one checkbox that opens the full agreement in a pop-up, and only when it's required.
5. **Sign & approve**: typed name, title, the agree box and the payment method choice.
6. **After signing**: a confirmation with the invoice, payment instructions, and the **Sign in and start setting up your fund** button.

- A step guide on the side shows where they are. The layout works on phones.
- Non-signers see steps 1 to 4 with a note naming who can sign.

## Technical details
- New server function `signerLinks(docId | quoteId)`: staff only. It returns one link per selected recipient. Signers' links come from the existing `acceptLinkFor(kind, id, approvedVersion, email)`; review links come from `signProposalView`. Each copy is logged as an event, for example `link_copied` with `{ email, kind: "sign" | "view" }`.
- Recipients are read from the latest `sent` event. Before the first send, they come from the picker.
- A shared `SalesRecordHeader` + `SalesProgress` + `RecipientsPanel` + `LinkedRecordsCard` is used by both `sales_.documents_.$id.tsx` and `sales_.quotes_.$id.tsx`. Progress is computed in a pure helper `salesProgress(record, events, acceptance, sow, invoice)` with unit tests.
- `accept.$token.tsx` is restructured into the step sections above, reusing the current sign, MSA and pay logic. There are no changes to signing rules, invoices or money paths.

## Not changing
- Approval rules, who can sign, MSA once-per-version, invoice creation, payment handling, and the rule that bank details never appear in emails.
