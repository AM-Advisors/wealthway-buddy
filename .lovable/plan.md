# One-place proposals: services, quote, MSA and SOW together

## What changes for you
Sales → Proposals & RFPs becomes the one place to build a deal, using the form layout in your screenshot. The proposal it produces looks like the White Glove Investor Services proposal you uploaded.

**1. Prospect by email, at the top of the form**
- Type an email. If that person is already on the platform (a client contact, CRM contact or account), their name, organization and client fill in, and you'll see "Found on platform".
- If no one matches, an **Add new prospect** panel opens right there: name, organization, title and phone. Saving creates the CRM contact (and an organization) linked to the deal. Nothing is duplicated, and a match always uses the existing person.

**2. Pick services, get one combined quote**
- The "Quote" dropdown is replaced by a **Services** picker. Tick any mix of rate-card items: SPV administration by raise, administration product and level, Investor Services, NAV, tax, banking and add-ons.
- Everything goes into **one quote**, grouped as One-time, Recurring (monthly, quarterly or annual) and Per-event, with one total. You can still change quantity, price and billing frequency.
- Prices still come only from the rate card. Discounts still need CEO or CRO approval, and Super Admins can self-approve with a logged reason, as today.

**3. Proposal styled like your PDF**
- Navy cover with the Harmonious logo, a "Proposal for Services" eyebrow, and the title and summary.
- "What we handle": numbered services (01, 02 …), each with its description.
- "Investment": the fee table (amount and frequency for each service, plus quarterly-in-advance billing where it applies).
- "Ready to begin?": acceptance lines for the fund and for Harmonious.
- AI still writes the first draft of the descriptions and summary. Marketing can still help, and approval works the same as today.

**4. MSA and SOW together**
- Once the quote is approved, one **Agreement packet** holds the proposal, the MSA (only if the client doesn't have a signed one) and the SOW built from the same service lines.
- One Send action sends the packet. The client signs the MSA and SOW in the same session, and status shows on the proposal page.
- Billing still starts only after signing. Invoices still need a second person to issue them.

## What stays the same
- Approval rules, commission tracking from paid invoices, and audit history.
- No money moves automatically.
- The separate Quotes page stays as a read-only list that links here, so older links still work.

## Steps
1. Add an email lookup that finds existing people and organizations, with inline Add new prospect.
2. Embed the multi-service picker in the New document form, saving one quote linked to the document.
3. Add a branded proposal layout matching the PDF, for both on-screen preview and export.
4. Combine creating the MSA and SOW into one packet with a single send and signing status.
5. Test: new prospect, then three services, then approve, then send the packet; an existing email is reused.

## Technical details
- New server fn `lookupProspectByEmail` (staff with Sales capability), searching persons, client_contacts and crm_contacts by normalized exact email. `createProspect` reuses the existing CRM/person linking, so it never creates a duplicate.
- `createSalesDocument` accepts `lines[]`, calls the existing `saveQuote` and links `quote_id`. The existing `QuoteBuilder` is reused as an embedded component.
- Proposal template: a new `proposal-layout` renderer reading the document sections plus the quote lines. Export goes through the existing `exportSalesDocument`.
- The packet reuses `createAgreements` (SOW plus MSA if none exists). A new `sendAgreementPacket` sends both through the existing agreement signing flow, in one email.
- Authorization stays server-side. No schema changes beyond an optional `packet_id`/`quote_id` link, which is additive and nullable.
