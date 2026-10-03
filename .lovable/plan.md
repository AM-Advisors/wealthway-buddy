# Separate "Create & Sync Investor Records" button on the Operations fund page

## Goal

On the Operations fund page's Google Drive card, add a second button that creates and syncs the **investor records** folders for every investor in the fund — separate from the existing **Sync Fund Records** button, which only handles the fund-level folder.

## What changes

1. **New server function `syncAllInvestorDrive`** in `src/lib/drive.functions.ts`:
   - Same permission check as the existing syncs (`requireOperations(context, "documents", "prepare")`), so only Harmonious staff with document-prepare access can run it.
   - Loads every investor onboarding for the fund that has an investment profile.
   - For each one, calls the existing `drive.ensureInvestorStructure(offeringId, profileId)` — the same code the single-investor sync already uses, so folder naming, the restricted investor repository, and permission handling stay identical.
   - Returns a per-investor result list (profile label, status, error) plus a summary (created/synced/failed counts). One investor failing does not stop the rest.

2. **New button in `src/components/drive-status-card.tsx`** (the card shown on the Operations fund page):
   - "Create & Sync Investor Records" sits next to "Sync Fund Records", visible under the same `canSync` condition.
   - Disabled while running; on completion shows a toast with the summary (e.g. "8 investor folders synced, 1 needs attention") and refreshes the card so the Investor Records row and folder count update.
   - If the investor repository is in permission review, the button surfaces that error instead of partially running.

## What does not change

- The existing Sync Fund Records button and the per-investor sync used on the investor 360 page stay as they are.
- Tax forms and identity evidence still never go to Drive.
- No automatic/scheduled syncing — the button is manual, like today.

## Verification

- `tsgo` typecheck and existing drive tests.
- Preview: open a fund under Operations → Fund Setup, press the new button, confirm investor folders appear and the Investor Records row updates.
