# Simpler quote and proposal emails, SOW-based services, About Harmonious last

## What changes for you

1. **One action: Sign & approve.** The quote/proposal email and the client review page show a single "Sign & approve" path. The separate "View document" button and the full document copied into the email go away. People who can't sign still get a view-only link that says who can sign.

2. **Standard email wording** for every quote, proposal, RFP and RFQ sent to a prospect or current client:

```text
Hello {Client Name},

Your proposal is ready for review and authorization. Please click here to open your quote.

{Sales rep message}

Thanks,

{Harmonious Sales Rep Name}
```
- "click here" is the link (it opens the sign-and-approve page for signers, view-only for others).
- The rep's typed message goes in the middle. If it's blank, that line is left out.
- The rep name is the person sending. If that person isn't on file, the client's assigned Sales Representative is used.
- The subject line stays editable. CC, signer choices and send history work the same as now.

3. **Services come from the SOWs.** The "What we handle" / services section lists each selected service with its full statement-of-work description (scope, deliverables, how often, who is responsible), taken from the same SOW the client signs. A service with no SOW wording falls back to its name and price, so nothing is made up.

4. **About Harmonious moves to the end**, after the pricing and totals, on quotes, proposals, RFPs and RFQs, both in the preview and on the client page. The wording is still the controlled version only a Super Admin can change.

## What stays the same
- Approval before sending, MSA shown only at signing and signed once, signing a quote also signs its SOW, automatic invoice and commissions, recorded history.
- Documents already sent keep the version the client received.

## Technical details
- `sales-documents.server.ts` `sendDocument` and the quote send path: replace the custom HTML/text with a new registered template `sales-proposal-ready` (React Email, Harmonious colors) taking `clientName`, `linkUrl`, `repMessage`, `repName`, `canSign`, `signerNames`; keep tracking link, open pixel, CC and `sendOutreach` history logging. Idempotency key per document, version and recipient.
- `sales-documents-model.ts`: section order puts `about` last (after `services`/`pricing`/`timeline`/`next`) for proposals and RFQs; `applyLockedSections` reorders existing saved sections at render without changing stored versions.
- Services section built from the SOW service catalog descriptions already used for SOW generation (new pure helper `serviceDetailsFromSow(lines, sowCatalog)`), plus the pricing table.
- `accept.$token.tsx`: one primary "Sign & approve" action; About Harmonious rendered after pricing.
- Tests: email fills name/message/rep and omits empty message; About Harmonious is last; services fall back to name when SOW text is missing.
