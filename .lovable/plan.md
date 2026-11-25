# Kimberly and Joe's trust: clean up the investor page

## What's wrong today (Corps Erebor, J Girardi K Girardi Rev Trust)
- **"1 required item left", but every line has a check mark.** The open item is Kimberly's missing SSN. The checklist counts each person's items but never lists them, so it can't be seen.
- **Joe isn't visible near the top.** "Investor details" shows only Kimberly (the login account), and Joe appears much further down. He is on the trust as trustee, 50% owner, signer and W-9 signer, with approved ID and SSN on file.
- **"Use Kimberly Girardi" is offered although she's already on the trust.** The cause will be confirmed before fixing.
- The trust's legal name, state of formation and tax ID sit in separate boxes instead of in the investor details.

## What it will look like
For trusts and companies, "Investor details" becomes one ordered page:

1. **The investor: the trust.** Legal name, state or country of formation, tax ID type and last four digits, one Save. The tax ID type stays locked once saved.
2. **Trustees and signers.** One details card per person, laid out like Kimberly's today: name, email, phone, birthday, citizenship, address, SSN status, ID check status, signer and W-9 signer badges. Joe gets his own card next to Kimberly's.
3. **Account login.** A small line saying who signs in (Kimberly) and who's invited (Joe, invite pending). This is kept separate from who invests, so login and investing party never mix.

The checklist moves to the top and lists every open item, including "Kimberly Girardi: add SSN" with a box to enter it, so the count always matches what you see. The separate "Trust details" box and the duplicate legal name fields are removed. Individual investors' pages stay as they are.

## Refreshing their account
- Re-check the trust's records and fix only real mistakes, for example a duplicate or wrongly linked Kimberly entry. Nothing is deleted, and every change is logged.
- Recompute the investment's progress so the steps reflect Joe's approved ID check, which covers the trust.
- Report what's still needed. Expected: Kimberly's SSN, unless the trust uses Joe's, and Joe accepting his invite once you've published.

## Technical details
- `investor-record-page.tsx`: for entity/trust profiles, render the entity block (legal name, jurisdiction, InvestorTaxIdCard inline) first, then per-person cards from `data.related` reusing the `editRelatedPartyFn` `details` save. Show the account person as a login line, not as the investor.
- `entity-requirements-inline.tsx`: render `personId` items with their existing inline inputs. Fix the pickable filter (compare normalized person ids, and exclude merged originals).
- Fields a relationship save can't store yet (address, citizenship per trustee) are shown read-only from the person record, with no new tables.
- Tests: the open-item count equals the listed items, and someone already on the trust is never offered as "Use".
