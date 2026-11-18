# Fund intake from a shared folder: read everything, review, then save

## Goal
When Operations adds a **new** or **migration** fund, they can paste one or more shared folder links (Box and/or Google Drive). The platform then reads every file in those folders and suggests:
- the fund's details (setup fields, fees and terms, signers, banking choices)
- the fund's documents (operating agreement, PPM, subscription agreement, EIN letter, SS-4, wire letter and so on)
- the investors, with each investor's details and their forms (W-9/W-8, signed subscription, accreditation proof, ID)

Staff check everything on one review screen. Nothing is saved until someone approves it.

## How it works for staff
1. **Add fund** (new or migration) gets a step called "Pull from a folder". Paste a Box or Google Drive link. Several links are fine, for example one for fund documents and one for investors.
2. The platform lists every file it found and sorts each one: fund document, investor form, or not used. Staff can change how a file is sorted, or skip it.
3. AI reads the files in the background and shows progress ("12 of 40 read").
4. **Review screen, 3 sections:**
   - **Fund details:** each suggested value shows its source file and page, and any conflicts between files are flagged. Approve, change or deny each one, or approve every value where the files agree.
   - **Fund documents:** the type and title are suggested, and staff confirm before the file is saved to the fund's Documents.
   - **Investors:** one row per suggested person or investing party, grouped across files. Each row shows any existing match on the fund (to avoid duplicates), the forms that belong to them and the details pulled out. Choose Add, Match to existing, or Skip.
5. **Apply:** approved items save through the existing fund setup, document and add-investor steps. No emails go out and nobody is invited. Approved investors then show up in the new "Invitations and activity" list as "Not invited yet".
6. **Migration funds** also record past signed copies and past identity checks as earlier evidence, the same way current migration imports do.

## Safety rules that stay in place
- Staff only: Operations roles, plus Super Admin for linking a new folder.
- Fees and terms are saved as drafts that still need the usual approval.
- Bank account and tax ID numbers are never read into fields. Their files are attached for review only.
- Identity documents still go through Verification review. Nothing is marked approved, signed or funded just because a file exists.
- Every decision (approve, deny, change, skip) is kept in history and can't be edited later.
- Outside platform names never appear on screen. The box says "Paste a shared folder link".

## What I need from you before building
- **Google Drive:** the app already reads Drive folders for investor intake, so this reuses that connection. If the folder belongs to a client's own Drive, it has to be shared with the connected Harmonious account.
- **Box:** today the Box connection only handles signing. Reading folders may need its access widened, or a reconnect with read permission. I'll check this first and tell you if a reconnect is needed.

## Technical details
- New `fund-intake` module (`fund-intake-model.ts`, `.server.ts`, `.functions.ts`) plus a migration adding `fund_intake_runs` and `fund_intake_files`, and an append-only `fund_intake_decisions` table with a block-mutation trigger. These are staff-only server reads, with GRANTs to service_role.
- Folder listing reuses `drive-intake.server.ts` for Drive and adds `listFolder` and `downloadFile` to `box.server.ts`. The link parser accepts Drive folder URLs and Box shared/folder URLs.
- File sorting uses `drive-labels.ts` and `box-file-kind`. Reading reuses `fund-doc-extract.server.ts` for fund fields and `investor-doc-extract.server.ts` for investor fields, with the same redaction, citations and conflict detection.
- Files are read in small batches, each request handling a few files and saving progress to `fund_intake_files`, so no single request goes over the Worker time limit. The page polls for progress.
- Investor grouping uses the existing person-resolution and duplicate checks; merges are never inferred. Applying an investor calls `createInvestor` (no invite), and their files go through `recordPriorDoc` / `uploadDocFor`. Fund fields save through the canonical setup save paths, and documents through the offering document upload (new version, explicit activation).
- The UI is a new "Pull from a folder" step in the Ops add-fund flow and on the fund's Setup tab, reusing the existing approve/update/deny review components.
- Tests cover link parsing, file sorting, conflict and grouping rules, and confirm that applying never sends email or marks verification or signatures done.
- The `src/lib/AGENTS.md` rule is updated.
