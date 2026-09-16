# Cap table migration: mapping and reconciliation

Today a founder can upload a Carta or Pulley file, we detect the provider, guess the columns and
create shareholders, securities and vesting when the batch is accepted. What's missing is the rest
of the picture: share classes and funding rounds have to already exist, and there is no check that
authorized, issued and outstanding shares add up. This adds those pieces.

## What the founder will see

**1. Upload and detect** (unchanged)
Carta, Pulley, AngelList or a plain spreadsheet. Provider named on screen.

**2. Map the columns** (extended)
Existing fields stay. New mappable columns:
- Share class authorized shares
- Funding round / financing name, round date, round price per share
- Amount invested

Anything we can't match is shown as "not mapped" with a dropdown, as now.

**3. Review what's coming across** (new section)
Three grouped lists above the line-by-line rows:
- **Shareholders** — new people, and ones we matched to existing records by email then name, with a
  dropdown to re-point a match.
- **Share classes** — each class found in the file, its authorized number, and whether it is new or
  already on file. New classes are created automatically and labelled "New".
- **Rounds** — each financing found, its date and price, new ones labelled "New" and created
  automatically. Securities dated inside a round, or naming it, are linked to that round.

**4. Reconcile** (new step, before accepting)
A table per share class showing:

```text
Class        Authorized   Issued (file)   Outstanding   Your totals   Difference
Common        10,000,000      8,400,000     8,400,000     8,400,000          0
Series A       3,000,000      3,100,000     3,100,000     3,100,000   over by 100,000
```

Authorized and issued are read from the file where those columns exist; the founder can type or
correct any of the three numbers, and we show the difference against the file. Options, RSUs and
warrants are counted separately as reserved, not as issued shares, and the fully diluted total is
shown underneath.

If a class is issued beyond its authorized number, the batch shows a clear warning and the person
accepting it must type a reason. The reason and the reconciliation snapshot are written to the audit
trail with the batch.

**5. Accept**
Blocking problems (missing name, bad quantity, unmatched required column) still stop the batch.
The overage is a warning with a reason, not a block. Nothing is recorded until accepted.

## Notes

- Demo companies stay read-only; nothing in this touches real records from demo data.
- No provider APIs — the uploaded file remains the only source.
- Works alongside the concierge flow: a concierge batch still needs founder approval first, and the
  reconciliation is part of what the founder approves.

## Technical outline

- `src/lib/captable-migration-fields.ts`: add `authorizedShares`, `roundName`, `roundDate`,
  `roundPricePerShare`, `investmentAmount` with synonyms for Carta/Pulley header wording.
- `src/lib/captable-migration.functions.ts`:
  - extend `MappedRow` / `mapRow` for the new fields;
  - build class and round summaries during analysis and persist them on the batch;
  - on import, upsert `ct_security_classes` (name + `authorized`) and `ct_rounds` by normalized
    name, then set `class_id` and the round link on created securities;
  - compute per-class authorized / issued / outstanding / reserved from mapped rows plus any
    existing `ct_securities`, and store the reconciliation on the batch;
  - accept `overageReason`, require it when issued > authorized for any class, and write it plus the
    reconciliation into `ct_events`.
- Migration: add `reconciliation jsonb` and `overage_reason text` to `ct_migrations`; add a
  nullable `round_id` reference on `ct_securities` if one is not already present.
- `src/components/captable/migration-view.tsx`: new mapping rows, the three review groups, and the
  reconciliation table with editable totals and the reason field on accept.
