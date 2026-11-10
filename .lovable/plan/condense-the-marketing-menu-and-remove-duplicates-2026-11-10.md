# Condense the Marketing menu and remove duplicates

## What's duplicated today
- **Two calendars:** "Publishing calendar" (posts and emails) and "Editorial calendar" (articles), listed side by side.
- **Content library listed three times:** "Content library", "Collateral Studio" and "Imports" each have their own menu line, but they are already tabs of one library page.
- **Three "studio" entries:** Editorial studio, AI content studio and Design Studio sit as separate lines, with a Research feed beside them.
- **Two account pages:** "Channels" (company pages) and "LinkedIn accounts" (personal profiles) are separate lines under one heading.
- **Overview** repeats "Coming up this week" and links to the calendar twice.

## New, shorter menu
```text
Marketing
  Overview
  Content        -> Studio · Research · AI drafts · Design      (tabs)
  Social posts
  Email          -> Emails · Follow-up flows · Audiences        (tabs)
  Calendar       -> Publishing · Editorial · Campaigns          (tabs)
  Library        -> Drive & sheets · Collateral · Imports       (tabs)
  Performance
  Accounts       -> Company pages · LinkedIn profiles           (tabs)
  Classroom · Sales requests  (kept, moved to the bottom)
```
From 20+ lines down to 10, and each area gets one row of tabs at the top of its pages, so you can switch without going back to the menu.

## What stays the same
- Every page, saved item and old link keeps working. Nothing is deleted.
- Who can see or publish what doesn't change. Contributors who only see the Editorial studio keep their two items.
- Approvals and publishing rules stay as they are.

## Overview tidy-up
- One calendar link instead of two; "Coming up this week" stays as the single preview.

## Technical details
- Rewrite the marketing item list in `ops-sidebar.tsx` to the structure above (no sub-menus duplicating tabs).
- Add a shared `MkSectionTabs` in `marketing-ui.tsx` (generalizing `MkLibraryTabs`) and render it on each group's pages, using router `Link` instead of plain anchors.
- Update the active-state logic so tabbed pages highlight their parent menu item.
- Adjust `app-ops-separation.test.ts` if it asserts the old menu entries; run it.
