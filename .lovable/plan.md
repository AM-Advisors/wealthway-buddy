# Help Center articles for the new self-service steps

Earlier I updated the EIN, banking, fund setup and investor invite articles, and added "Adding teammates to your fund" and "Filling in an investor's details". This round covers the rest.

## New fund manager articles
1. **Launching your fund**: check the setup percentage, see what's still open, click Launch fund and confirm. Explains what changes for investors once a fund is launched.
2. **Closing and reopening your fund**: close with a reason and what investors see while the fund is closed. To reopen, request it, then a different fund manager of the fund approves it.
3. **Editing before investors sign or fund**: what you can change directly, what goes to Harmonious after someone signs or sends money, and where to see who changed what (the investor's History tab and the fund's Record history).
4. **Tracking investor progress**: what the four step dots and five statuses mean, plus the personal investment link (create it, copy it, email it).
5. **How investors send capital**: choosing Wire, ACH or Check, including the timing warnings. Explains that ACH only records a request.
6. **Investor update emails**: how to set immediate, daily, weekly or off, separately for investors and for managers.
7. **Your deal room**: choosing which documents prospective investors see before they commit, NDA settings and answering questions.
8. **Signing your fund's W-9**: when it appears and how its details come from your fund record.
9. **Statements of work**: where to find them, and how to sign one or send it back.

## New investor articles
1. **Reviewing a deal before you invest**: the deal room, view-only documents and the NDA.
2. **Investment profiles**: adding a new investment profile, and which details each type needs (individual, joint, IRA, company, trust).
3. **Your documents, once per profile**: what's required, using Update, and that earlier versions are kept.
4. **Your personal investment link**: where to find it, and that it only opens for the invited email after sign-in.
5. **Going back a step**: reviewing earlier steps, and what can still be changed after signing.

## Article rules
- Every article names real buttons and pages, gives numbered steps and has one "What Harmonious still does" line where it applies.
- The articles say nothing about pricing, and nothing that suggests money moves or filings happen automatically.
- Each new article goes through the existing help approval step, like the others.

## Technical details
- Articles are added to `src/lib/help-catalog.ts` with the same `c({...})` shape, roles (`fund_manager` / `investor`) and service tags.
- `help-articles.test.ts` is re-run, and one check confirms every new slug exists, has steps and has the right audience.
