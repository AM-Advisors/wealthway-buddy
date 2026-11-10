# Keep fund team and signers in sync (Snoretox / Jason)

## What we found
- On 4D Snoretox SPV, Jason Goldenberg is on the fund team as GP, and his permissions include "Authorized signatory".
- The fund has **no signers recorded**. Team membership and the signer list are two separate records, and ticking "Authorized signatory" on the team never creates a signer.
- The signer picker builds its list from the client's contacts and the fund's managers. It does not look at the fund team. Jason is a 4D client contact, so he should show up in the main Signatories picker. Where he is missing, it is most likely a picker that only reads recorded signers (for example, where documents are sent for signature). We will confirm which screen first.

## What will change
1. **One source for "who can sign"**
   - Giving a team member "Authorized signatory" adds them as a fund signer. The first signer added becomes the primary signer, same as today.
   - Removing that permission, or removing the person from the team, also removes them as a signer. History is kept.
   - Adding a signer from the Signatories card puts them on the fund team with "Authorized signatory" if they aren't already there.
2. **Pickers see the team**
   - Fund team members show up as signer choices next to client contacts and fund managers, with no duplicates for the same person.
   - Document signer pickers that only read recorded signers now show any team member who has "Authorized signatory".
3. **Fix Snoretox now**
   - Record Jason as Snoretox's primary signer, using his existing person record. His title is left blank for you to fill in.
   - Check other funds for the same mismatch (team member marked "Authorized signatory" with no signer, or the reverse). Show you the list before changing anything.
4. **Unchanged**
   - A signer still needs a verified identity before signing. Jason's identity check has not been started yet, so he can be selected, but signing waits until he is verified.
   - Signed documents and past signer history stay as they are.

## Technical details
- Data confirmed: `fund_team_members` has Jason (`team_role: gp`, `permissions` includes `authorized_signatory`, linked to his login). `fund_signatories` has no active rows for offering `ff02424d…`. His `client_contacts` row is active and linked to person `8908ef65…`.
- Verify step: identify the picker the user saw (`FundSignatoriesCard` / `FundPersonPicker` vs document-send signer selectors) by tracing every reader of `fund_signatories` and the team permission.
- Sync: a server helper in `fund-signatories.server.ts` is called from the team-permission save and team-removal paths, plus the reverse call from `addFundSignatory` / `removeFundSignatory`. It resolves the person through the existing `personForContact` / person-by-user lookup, never creates duplicates, and is idempotent. Changes are logged through the existing `audit()`.
- `listFundSignatories` candidates gain `team:` entries from active `fund_team_members`, de-duplicated by person and email. `addFundSignatory` accepts `team:` keys, checked against the exact fund.
- Snoretox fix and the mismatch report run through the same helper. The report is read-only until you approve.
- Tests cover these rules: the permission adds a signer; removing it removes the signer; a person never appears twice in the picker; a team key from another fund is rejected.
