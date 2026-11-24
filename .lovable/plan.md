# LumaSenseye II: close the gaps, add ID cards to each person, and let managers see full SSNs

## What I found (LumaSenseye II, 24 investors)
- **Signed papers are loaded:** every investor has a Subscription Agreement and Operating Agreement. 18 have K-1s and 17 have accreditation files.
- **Nothing was read out of those papers:** none of the 24 has an SSN, ID check, KYC or AML screening on file. Only 2 have a birthday. No investor has a login yet.
- **Why it shows incomplete:** 15 are funded and 9 are stuck at the profile step. Every checklist is waiting on the investor for details that are probably already in the papers we hold.
- **ID cards today:** an uploaded driver's license or passport is tied to one login and one investment, not to the person. So nobody without a login can have one, and it isn't reused across funds.

## What I'll build
1. **Read details from loaded papers.** The document reader goes through each investor's loaded Subscription Agreement and accreditation files. It pulls out the SSN or EIN, birthday, address, phone, and owners and signers for trusts and companies. These fill blank fields only and are labeled "From signed paperwork." It never overwrites anything already entered or verified, and every fill is logged.
2. **ID cards on the person.** Staff, the fund manager or a helper can upload a driver's license, state ID or passport to the person's own record (front and back, or the passport photo page). The reader recognizes the ID type and reads the name, birthday, ID number (only the last 4 are kept) and expiration date. The card then shows wherever that person appears: individual investor, trust owner, signer, or another fund.
3. **Fund manager access.** Managers of that exact fund can open the investor's ID card and view the full SSN or EIN through a "Show full number" button. It hides again after 60 seconds, and each view is logged with who, when and which investor. Other funds' managers, team viewers and investors' helpers keep seeing "On file" or the last 4 only.
4. **Fill the KYC gap honestly.** An ID card plus a matching name and birthday lets staff start the existing helper-run ID check or manual verification entry. An uploaded card never marks KYC or AML done by itself.
5. **One-time LumaSenseye II catch-up.** I'll run the reader over all 24 investors and give you a summary file. It lists, per investor, what was filled in, what's still missing, and who needs to act (investor, manager or Harmonious). No emails are sent.

## Technical details
- Add a person-level ID card table (person, type, sides, storage path, ID number last 4, expiration, uploader, source). Logins link through the person record. Existing ID uploads get copied over with their links to their investment, and the originals stay in place.
- Full SSN stays encrypted in the existing private tax-ID store. A new manager reveal goes through `fundAccessFor` with the exact fund, plus a check that the person is tied to an investment in that fund, and writes an audit row on every reveal.
- Details read from paperwork go through the existing prior-document reader with a new extraction step. Fills use the existing blank-only person and relationship writers. Afterwards, readiness is recomputed and the summaries are refreshed.
- Tests: exact-fund manager can reveal; another fund's manager can't; team viewer can't; paperwork never overwrites existing values; an ID upload never sets KYC as approved.
