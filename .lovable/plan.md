# Add the Drive funds to the platform

## What I found
- The Drive folder has 128 fund folders plus "*Archived Funds" (skipped) and a few loose files ("Migration Funds - docs needed per fund", "Fund Nickname" list, several short notes).
- About 26 of those funds are already on the platform (Erebor, LaaSy, Upper90, Firehawk, Blacklake, the 4D funds, Chapter 1 and 7, Pro Supps, Roas, Darmen LP, Founders Fund, Trail Post RB, and others). Names differ slightly in some cases (for example "Roas Capital Management" folder vs "Roas Hedge LP" fund), so each match is confirmed before skipping.
- About 100 funds are not on the platform yet.
- Some folders look like duplicates of each other or of existing funds (two "Pro Supps SPV" folders, two "Chapter 7", two "Cogent Founders Fund", "Satschel Corps", folders named after people such as "Luis Aranguren -- Innovlac Capital"). These go on a "needs your decision" list rather than being created automatically.
- Folders that look like a manager or master entity, not a fund (for example "Kudu Venture Capital LLC", "HCAM WY LLC", "Darmen Debt Fund I GP LLC", "Trail Post Ventures Management LLC") are listed as clients, not funds.

## What I will do
1. Read the "docs needed per fund" sheet and the nickname list, then open each new fund's folder to note its legal name, manager/client, and which key papers are present or missing (operating agreement, subscription agreement, formation papers, EIN letter, investor list, bank details).
2. Match each fund to its existing client, or create the client when it does not exist yet.
3. Add each new fund as an existing (migration) fund, with its Drive folder linked and its legal name taken from the folder or formation papers.
4. Give you a checklist: already on the platform, newly added, needs your decision, and per fund what is missing from the folder.

## What I will not do
- No investors, holdings, balances or cap tables imported, and no documents published to investors (live investor import is still on hold).
- No emails or invitations to managers or investors.
- No fund launched, no bank details released, nothing filed, no money moved.
- Drive sharing stays as it is.

## Technical details
- Reuse the existing Drive migration and intake tools (drive-migration / drive-intake) rather than a new importer; funds created with fund_origin = migration, drive_folder_url set to the folder, audited per fund.
- Matching by normalized legal name plus series/master parent; ambiguous matches held for review.
- One transaction per batch with a written before/after count.
