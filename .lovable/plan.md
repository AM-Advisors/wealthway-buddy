# Platform updates suggested by Eradivir's investor list

Eradivir's 90 investor records show patterns that repeat across every fund you'll onboard. Each gap below maps to a platform improvement. Nothing here changes Eradivir's data — these are tool improvements.

## What the list shows

- 31 of 90 investors have no email on file — KYC links, document signing, and portal invites can't reach them
- All 90 have KYC/AML "not started" — sending Didit links one at a time doesn't scale
- 90 records but only 78 distinct names — likely duplicates from the spreadsheet + cap table imports
- 12 investors have no class assigned
- 79 of 90 show no funded amount — commitment vs. received money isn't tracked visibly

## Proposed updates (pick any subset)

1. **Bulk KYC invite** — select investors (or "all missing KYC") on a fund's Investors tab and send Didit links in one action, with per-investor send status. Skips investors with no email and lists them.

2. **Duplicate investor detection** — a review queue per fund flagging likely duplicate people (same/similar name, matching email or amount), with a staff-confirmed merge that keeps one record, carries over documents/commitments, and logs the merge in Audit History. No automatic merging.

3. **Missing-info request to fund manager** — turn the existing "Missing info" column into an action: one click emails the fund manager a checklist of what's missing per investor (email, class, address), so they can supply it without staff re-typing.

4. **Funding progress on the Investors tab** — a committed vs. received column and a fund-level total bar, so you can see who has actually wired money. Display only; no money movement.

5. **Bulk class assignment** — set the class for a selected group of investors at once (e.g. assign "Class A" to 40 checked rows).

## Technical notes

- Bulk KYC reuses the existing Didit link sender (per-investor server authorization, no auto-approval); results still come only from Didit.
- Merge is staff-only, manual-confirm, audited; no data deleted — the losing record is archived with a pointer.
- Funding amounts use the existing commitment/funded fields on investor records; no schema change expected except possibly a merge audit table.
- All changes respect the standing rules: Didit stays the KYC/AML authority, no automated filings or money movement, server-side authorization.
