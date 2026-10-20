# Finish the remaining review panels

## Where each one stands after the last round
- **Client invoices:** the separate panel was a copy of the client's Invoices page, so I removed it. The Invoices page is where clients review, approve or dispute invoices.
- **Client SOW:** now shown on the client's portal home whenever a statement of work is waiting. Clients can open it, sign it or send it back from there.
- **Diligence rooms:** the panel was a copy of the fund manager's Diligence page, which already shows rooms and visitor traffic, so I removed it.
- **Delegation banner:** the professional's "acting on behalf of" page already shows a fuller banner, so I removed the duplicate.
- **Third-party badge:** shown only on investor bank verification (Plaid) so far.

## What this round finishes
1. **Make each panel easy to reach**
   - Add a Statements of work link to the client menu, next to Invoices.
   - Add a link from the deal room to the fund's Diligence page, for fund managers only.
   - Show the professional's "acting for" banner on every page a professional opens for a client, not only the first page.
2. **Use the third-party badge everywhere an outside provider does the step.** Each place gets a "Depends on ..." badge and a short note saying Harmonious can't guarantee the timing or result:
   - identity checks (Didit)
   - e-signatures (Box Sign)
   - IRS EIN and filings
   - state formation filings
   - bank account opening
3. **Check it signed in.** I'll go through each spot in the preview as a client, a fund manager and a professional, and confirm what each person sees.

## What won't change
- No access changes. The links and badges are display only, and every page keeps its own server check.
- Quick wire confirm stays off.

## Technical details
- Client menu entry is added in navigation.ts, so the client menu checks need updating.
- The acting-for banner moves into the professional.acting layout so child pages inherit it.
- The ThirdPartyBadge and ThirdPartyNote components go on the identity-verification step, the signing step, EIN/SS-4, formation and bank-application cards.
- One test checks that the client and professional menus contain the new entries and no Operations links.
