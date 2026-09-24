# Google Drive — automatic Fund & Investor file structure

## What I found (read-only, nothing changed in Drive)
- **Connection:** the workspace Google Drive connection "Harmonious Technology" can reach the root folder. It isn't linked to this app yet.
- **Root folder:** "Funds", inside the shared drive "Harmonious Team". It already holds about 50 real fund folders plus "*Archived Funds".
- **Who can open it:** 10 people get access from the shared drive itself. Two are organizers (info@, alyssa@) and eight are file organizers, including sales@. Anything filed under Funds is visible to all 10. Shared-drive members can't be removed from a subfolder.
- **Shared drive settings:** no domain-only or members-only limit, and downloads aren't restricted.

## Key decisions
1. **Signed W-9/W-8 forms stay out of Drive.** Everyone in the shared drive would see them, including sales@, so I can't lock them down to Tax-role staff. They stay in the existing private tax store, and the Investor "02 - Tax" folder stays empty on purpose. The same goes for government IDs, Didit data, AML/sanctions results, full TINs and bank credentials. Accreditation evidence is filed only when a policy flag allows it (off by default).
2. **Fund managers and investors get no direct Drive sharing.** "Open Folder" buttons check the app's own permissions first. Managers get only the Fund folder and non-sensitive investor subfolders for funds they manage, and only when they already have Drive access. Nobody is added to Drive automatically.
3. **Existing folders are never matched by name alone.** If a folder with the same name already exists, sync records a "conflict — review" item. Operations can link the existing folder ID explicitly or create a new one. Nothing is moved, renamed or deleted.

## What gets built
- **Linked records:** each Fund, and each Fund + Investment Profile, stores its Drive folder ID and subfolder IDs, along with status (active / archived / needs attention) and the last sync error.
- **Folder creation, safe to retry:** new folders get an app-generated tag. Before creating anything, the app looks up the tag, so a retry reuses the folder instead of making "Fund (1)".
- **Folder layout:**
  - Fund folder: 01 Fund Documents, 02 Formation & Regulatory, 03 Banking, 04 Accounting & Tax, 05 Reports, Investors.
  - Investor folder, named "[Name] - [Profile type]": 01 Subscription Documents, 02 Tax, 03 Compliance, 04 Accreditation, 05 Executed Documents.
- **When folders are created:** when a fund is launched, and when an investment is accepted. Only test-marked funds are included until rollout is approved.
- **Automatic filing:** fully executed Box documents (every required signer confirmed) go to 05 Executed Documents, and executed subscription agreements also go to 01. Files get new dated names and are never overwritten. Each filed file records the app's document ID, version and Drive file ID. Incomplete, cancelled or replaced documents are never filed.
- **Renames** update the folder name only. The folder ID never changes.
- **Deactivating** a fund or investor only marks it archived. Nothing in Drive is deleted.
- **When something fails:** the fund or investment itself is kept as is. Drive status shows "Needs attention", Operations gets a task, and a Retry button is available.
- **Audit log:** folder created, subfolder created, document filed, version, Drive IDs, who or what started it, sync or permission failures, and conflicts. Document contents are never logged.
- **Screens:**
  - Fund 360 and Investor 360: "Google Drive: Connected / Needs attention", with Open Fund Folder / Open Investor Folder.
  - Operations: "Create / Sync Google Drive Structure" for one fund at a time, plus a conflicts list.
  - Manager fund Documents and investor Documents: Open buttons, where allowed.
- **No bulk creation** for production funds.

## Technical details
- Link the google_drive connection to the project. Calls go through the connector gateway using `supportsAllDrives=true`, and the root ID is a server setting.
- The migration adds `drive_folder_mappings` (entity_kind, offering_id, investment_profile_id, folder_id, subfolders jsonb, status, is_test, last_error), `drive_filed_documents` (source_table, source_id, version, drive_file_id, folder_id) and `drive_sync_events`. All three are RLS: staff-only reads, service-role writes, plus unique constraints on (offering) and (offering, profile).
- The tag uses Drive `appProperties` (`harmonious_key`), and lookups query appProperties inside the parent folder.
- The filing hook sits next to the existing Box completion handler (`box-sign-complete.server.ts`), which is already the authoritative record of execution.
- Vitest covers every item in the spec's test list, using a mocked Drive client. Then the full suite, typecheck and production build run.
- Live check: one test fund under the real root, then removed from the app mapping only (the Drive folder is kept per the no-delete rule, or you remove it).

## Needs you / Google Workspace
- Confirm that tax forms staying out of Drive is acceptable. The alternative is a separate restricted shared drive for tax that only Tax staff belong to.
- Decide whether sales@ and the other members should keep access to all investor subscription and compliance files.
- Existing fund folders need a one-time review to link them to their funds.
