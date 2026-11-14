# CORPS Erebor investor onboarding packet

Blank paper packet for any investor: guide pages (fund at a glance, how to complete, what to return,
wire instructions), the versions in use for new investors (PPM v7 file Erebor_PPM_v8.pdf, Operating
Agreement v7 file Erebor_Operating_Agreement_Thomas_v9.pdf, Subscription Agreement v4 with the $100,000
minimum), Exhibits A to E (the Subscriber Information Form) and the current IRS W-9, W-8BEN and W-8BEN-E.

- Exhibits A to E are generated from the platform's own question sources
  (src/lib/standard-investor-questionnaire.json, onboarding-intake-model.ts), so paper and screen use the
  same wording. Rebuild the packet whenever those questions change.
- `prep_sa.py` makes a print copy of the Subscription Agreement: fills the fund signatory title from the
  fund record, leaves the Manager's acceptance signature/date blank, and shrinks heading text boxes so
  LibreOffice does not crop them. Legal wording is unchanged.
- `build.py` prints the Operating Agreement in black text (the approved file uses red for fund names),
  renders the guide pages and exhibits, and merges everything with bookmarks.
- Wire details are read from `/tmp/erebor-packet/wire.json`, exported from the fund's verified and
  released instructions. Never commit bank details to the repository.

Confidential fund documents: output goes to Files only, never to public/.
