# One "Trust & people" section for staff and investors

## What's wrong today (from your Kim / Girardi trust page)
The same trust and its people are shown in up to six places, and some disagree with each other:

1. Trust details checklist ("4 required items left"), shown twice
2. "Owners and signers" summary list, shown twice
3. Trust tax ID box
4. "Parties on this investment" (login, access, ID check, SSN)
5. "ID cards and tax numbers" (SSN, ID uploads)
6. "Owners, control persons & signers" (responsible party, W-9 signer, each person's form)

Disagreements: one section says Kim and Joe's SSN is "on file", another says "Not on file", and a third says "Needs SSN". The checklist says the responsible party and a trustee/control person are missing, but they are set in different boxes further down.

## What you'll see instead
One section called **Trust & people**, in this order:

1. **What's still needed** – one short checklist at the top. Each item is a button that jumps to the exact box to fill in. Shown once.
2. **The trust** – legal name, state of formation, tax ID choice (trustee SSN or trust EIN) and number, all with one Save.
3. **Roles** – Responsible party and W-9 signer pickers, plus a "Trustee / control person" checkbox per person, so the missing checklist items are fixed in one place.
4. **People** – one card per person (Kim, Joe). Each card shows, together:
   - name, role, ownership %, signer, "same person as their login account"
   - email, phone, birthday, SSN (one status: On file ending 1234, or Needed)
   - login and access, ID check and background check status
   - ID card upload and "show full number" (still logged)
   - Edit opens that person's form in place; Save and Remove stay on the card
5. **Add a person** – one button at the bottom ("Use someone already on this investment" or add new).

Removed duplicates: the second checklist, both summary lists, the separate Parties box and the separate ID cards box. Nothing is deleted from records; only the screen changes.

## Investor's own view
The investor's trust step gets the same Trust & people layout, so investors see the same checklist, the trust box and one card per person. Investors only see and edit what they can today: no staff notes, no other people's full numbers, no access settings. The checklist uses the same rules as the staff view, so both always say the same thing.

## Rules kept as they are
- One verified signer covers a trust; a trust on a trustee's SSN skips the business check.
- Full SSN/EIN views and ID uploads are still recorded.
- Edits after signing still go to review instead of saving directly.
- Same permissions as today; no change to who can approve, sign or move money.

## Technical details
- New shared `TrustPeopleSection` composed from existing `EntityRequirementsInline`, `InvestorTaxIdCard`, `InvestmentPartiesCard`, `InvestmentIdentityCard`, `RelatedPartiesEditor` data and save calls; no new server functions or tables.
- One pure `trust-people-model.ts` merges related parties + parties + identity rows per person and derives a single SSN status and the checklist; the investor journey and staff record both render from it.
- Fix the SSN status disagreement at the source by reading one field in the model (first step: confirm which reader is stale for Kim/Joe).
- Replace lines that render the separate cards in `investor-record-page.tsx`; add the section to the investor entity/trust step (exact component to confirm first; it isn't the compliance panels).
- Tests: checklist items and SSN status per person (on file vs needed), trust-on-SSN skipping business check, one-signer rule unchanged.
- Applies to LLCs and corporations too (title "Company & people"), since they use the same boxes.
