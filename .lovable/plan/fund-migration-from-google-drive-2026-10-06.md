# Fund migration from Google Drive

Goal: bring a fund that was never on the platform in from its existing Google folder in one guided flow. Pick a folder (or create a new one), sort every file into the right place, and use what's in the documents to fill in Fund Setup. Staff confirm every step.

## 1. Choose the fund's folder (Fund page → Drive card, and Fund Setup)

Replace "paste a folder ID" with a **Choose folder** dialog that has two options:
- **Use an existing folder.** Search by name or browse:
  - the Harmonious Funds shared drive
  - other shared drives and My Drive that the connected Google account can see
  
  Each result shows its path, how many files it holds, when it last changed, and whether it's already linked to another fund. Folders that are already linked can't be picked.
- **Create a new folder.** Same as today: a standard fund folder with 01–05 subfolders in the Funds drive.

What happens when you pick an existing folder:
- **Folder is in the Funds drive:** it's linked as the fund's folder, and any missing standard subfolders are added.
- **Folder is elsewhere:** a new standard fund folder is created in the Funds drive and the files are copied into it. The originals are left untouched, and the old folder is recorded as the "source folder".

## 2. Migration review (new "Migrate from Drive" step)

The server reads every file in the folder, including all subfolders, and lists them in one review table:

| File | Suggested type | Destination | Linked to | Action |
|---|---|---|---|---|

- **Suggested type** comes from the existing document types: formation, operating/LP agreement, regulatory filing, banking, financial report, tax, subscription agreement, side letter, and so on. It's based on the file name, the folder it sits in, and an AI read of the first pages.
- **Destination** is the standard subfolder for that type (01 Fund Documents, 02 Formation & Regulatory, 03 Banking, 04 Accounting & Tax, 05 Reports). Investor files go to the investor's own folder in the restricted Investor Records drive.
- **Linked to** names the investor for investor files. Names are matched against existing investors; when there's no match, the file is flagged "new investor".
- **Actions:** accept, change the type, change the investor, skip, or mark as a duplicate.
- **Blocked automatically:** files with SSNs, bank statements used as identity evidence, or anything else the existing restricted-evidence rule catches. They're never imported or copied, just flagged for a person to handle.
- Clicking **Apply** works through the accepted rows one by one:
  - moves or copies the file into its destination subfolder
  - records it as a fund or investor document using the existing import, which keeps version history and catches duplicates
  - shows each row's result (done / failed and why)
  
  Running it again only picks up rows that haven't been done yet.

## 3. Fund details from the documents (suggestions only)

The AI reads the key documents (operating/LP agreement, formation certificate, EIN letter, PPM, subscription agreements) and proposes:
- Legal name, entity type, domicile, formation date, fiscal year end
- EIN (stored in the existing encrypted spot, shown masked)
- Management fee and carried interest
- Investors with commitment amounts, and the documents they signed

Each suggestion shows the source document and the page it came from, with Accept and Reject buttons. Accepting goes through the existing rules:
- the legal name changes only through the existing legal-name change, which keeps its history
- fees become a new version
- investors are added through manual investor entry, with the usual check for a possible existing match

Nothing overwrites a value that's already filled in. A conflicting value shows side by side for you to choose.

## 4. Migration checklist on Fund Setup

A **Migration** panel shows how far along the fund is:

```text
Folder linked -> Files sorted (42/45) -> Fund details reviewed (6/8) -> Investors added (12/12) -> Ready for Setup review
```

It links to the open items. Finishing it never launches the fund or opens it to investors. The normal Fund Setup approval still applies.

## Who can do it

Super Admins and Operations leads. Leadership can view only. Every link, copy, move, import and accepted suggestion is kept in a permanent history.

## Limits

- Investor files need the restricted Investor Records drive set up first. Until then, investor rows wait as "held". The fund's own documents go through right away.
- Copying from another drive only works where the connected Google account has access. Folders it can't see won't appear in the picker.
- The AI reads PDFs and Word files. Scanned images with no text are typed by file name only.

## Technical details

- New `drive_migrations` table: offering, source folder, target mapping, status. Plus `drive_migration_items`: drive file id, path, suggested/confirmed type, destination, investor/profile, action, result, error. Each item is unique on (migration, file). Service-role only; history goes into the append-only `drive_migration_events`.
- Folder search and browse use the existing Drive gateway (`files.list` with `supportsAllDrives` and `includeItemsFromAllDrives`). Linking goes through `linkExistingFolder`. A new `adoptExternalFolder` handles the copy path (`files.copy` into the new tagged fund folder). Moves inside the Funds drive use `files.update` with `addParents`/`removeParents`.
- Sorting runs through the existing `classifyDocument`, `filingTargets` and `isRestrictedEvidence` rules, with an AI pass (default gateway model, json_schema) only when those rules can't tell.
- Importing goes through `importOne`. Investor matching goes through `person-resolution`. Investors are created through `investor-record` services. Legal name changes go through `changeLegalName`. EIN goes through the existing encrypted entity-details path.
- Fund-detail suggestions go into the existing investor/fund record suggestion pattern (append-only, with the source document and page). No silent overwrites.
- Applying runs in batches of 25 per server call, and the UI keeps going until every accepted row is done (keeps calls within time limits). Each row is idempotent.
- UI: a folder picker dialog in `drive-status-card.tsx`; a new route `ops.fund-setup.$fundId.migrate.tsx`; and a Migration panel on the Fund Setup tab.
- Add one rule to `src/lib/AGENTS.md`: Drive migration moves/copies and imports only after staff confirm each row, and fund details from documents are suggestions only.
