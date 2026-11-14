# CORPS Erebor investor onboarding packet

Blank paper packet for any investor: guide pages (fund at a glance, how to complete, what to return),
a Subscriber Information Form, then the versions in use for new investors (PPM v7 file Erebor_PPM_v8.pdf,
Operating Agreement v7 file Erebor_Operating_Agreement_Thomas_v9.pdf, Subscription Agreement v4 with the
$100,000 minimum) and the current IRS W-9, W-8BEN and W-8BEN-E.

- `prep_sa.py` makes a print copy of the Subscription Agreement: fills the fund signatory title from the
  fund record, leaves the Manager's acceptance signature/date blank, and shrinks heading text boxes so
  LibreOffice does not crop them. Legal wording is unchanged.
- `build.py` renders the guide pages and merges everything with bookmarks.

Confidential fund documents: output goes to Files only, never to public/.
