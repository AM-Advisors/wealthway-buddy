# Fund page: each detail shown once, everything within 2 clicks

## Goal
Every fund detail (fees and terms, banking, team, documents, setup progress, approvals) appears in exactly one place. Anything a manager or Harmonious needs is reachable in at most 2 clicks from the fund page: click 1 picks a tab, click 2 picks a step or item. No scrolling hunts, no "More" menu digging.

## What repeats today
- **Setup progress** shows in four places: the "Setup complete" tile at the top, the change summary strip, the Overview tab, and a "Setup progress" card inside Fund details.
- **Banking** appears both as its own Banking tab and as a section inside Fund Setup.
- **Team** appears inside Fund Setup and again as a separate Team view.
- **Documents** appear in the Setup "Documents & questions" step and in the Documents tab.
- **Approvals** have a "Review approvals" button above the tabs and an Approvals tab.
- **Fund details** (type, entity, EIN, raise) appear in the Basics step and in a Fund details card.
- Five tabs (To dos, Requests, Calendar, Regulatory, Services) are hidden under "More", so they take 3+ clicks.

## New layout

```text
Fund name · status badge · next action button (one)
[Overview] [Setup] [Investors] [Documents] [Approvals] [Banking] [Accounting] [Activity]
```

- **Overview:** the only place for summary numbers (setup %, investors, committed, funded, next deadline) and the single next action. The top tiles and change summary strip are removed.
- **Setup:** the five steps (Basics, Fees & terms, Documents & questions, Banking, Review & approve) shown as step buttons. Each step shows its details once. Team and signers move into Basics, with nothing shown elsewhere.
- **Documents:** the only home for fund documents and investor copies. The Setup documents step shows only what still needs doing, plus a link to Documents, not a second copy of the list.
- **Approvals:** the only approvals list. Requests become a filter inside it. The separate "Review approvals" button is removed.
- **Banking:** a single banking view. The Setup Banking step opens the same view, so the details are never copied.
- **Activity:** joins Audit History, Calendar and Regulatory as sub-views, each one click inside the tab.
- **To dos and Services:** To dos fold into Overview's next-action list. Services moves under Accounting.
- Old links (`?tab=details`, `team`, `todos`, `requests`, `calendar`, `regulatory`, `services`, `audit`) redirect to their new home, so bookmarks and emailed links still work.

## Unchanged
Approvals, signatures, money, identity and access checks stay exactly as they are. Nothing saved is moved or deleted, so this changes only where things appear on screen. Client and Operations views get the same structure. Operations-only items stay hidden from clients.

## Steps
1. Check every fund tab and Setup step against the current page to confirm the duplicate list above. Record which single home each detail gets.
2. Rebuild the tab bar with the eight tabs and remove the "More" menu, the top tiles, the change summary strip and the separate approvals button.
3. Remove repeated cards (the Fund details card, the Setup progress card, the second Team and Banking copies), keeping one canonical component for each.
4. Add one-click sub-views inside Setup, Approvals and Activity, and redirect old tab links.
5. Add a test that maps every old tab link to its new home, then do a phone-size click-through on the fictional QA fund. Count clicks to each detail and confirm none is more than 2.

## Technical details
- Main files: `src/components/fund-workspace.tsx` (PRIMARY, MORE, MERGED_SECTIONS, detailsBody, bankingBody, KPI grid), `fund-setup-canonical.tsx`, `FundApprovalsHub`, `FundCommandCenter`.
- Put the tab mapping in a pure `fund-tab-map.ts`, with a test covering old to new tab values. Use the existing `validateSearch` tab param.
- Keep the existing rule that the workspace mounts only the selected tab.
