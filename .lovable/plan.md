# Harmonious Collateral Studio + brand rules for marketing images

## Goal
Bring the collateral rules from the uploaded guide into the platform in two ways:
1. A new **Marketing → Collateral Studio** page that builds branded 2-page sheets.
2. The same rules applied every time Marketing uses AI to create images or draft posts.

## 1. Collateral Studio (Marketing → Collateral Studio)
- **Template picker:** SPV, Fund of Funds, Cap Table Management, Social Announcement. SPV and Fund of Funds start with the content from the guides already on the site.
- **Fixed structure:**
  - Page 1: the opening hook, the three-tier capital flow (investors → Harmonious vehicle → investments) and three reasons to choose Harmonious.
  - Page 2: a grid of six core services, plus a bottom card comparing the platform with dedicated specialist support.
  - Social Announcement: a single square card.
- **Controls:**
  - Delaware Series or Stand-Alone.
  - 506(b), 506(c) or both.
  - Turn individual services on or off and edit their wording.
  - Edit the opening hook and value points.
  - Show or hide the proof-point footer ("$24B+ AUA · 750+ Fund Managers · Your Funds On Easy Mode") with the lighthouse logo.
- **Brand rules built in, not editable:**
  - Navy #002856 shading to midnight, cyan #5dc6d1 for highlights and dividers, white cards with soft slate borders.
  - Rubik Bold headings and Poppins body text.
  - 80px margins, and a soft cyan glow only in the background corner, never under text.
  - Words never split or hyphenated across lines.
- **Checks before export:** the Studio scans all text and blocks export if it finds pricing or fee amounts, or offshore places (Cayman, BVI, "offshore"). Each problem is shown so it can be fixed.
- **Export:**
  - Download a print-ready PDF (2 pages) and presentation JPEGs (1600×2000).
  - Save to the Marketing library, so it can be shared with the existing tracked links and attached to approved emails.
- **Source guide alongside:** each sheet also downloads a matching written guide (Markdown) built from the same content. The guide is the source of truth and the sheet is what clients see.
- **Who can use it:** saved sheets follow the existing Marketing approvals. A different Marketing Manager approves before a sheet can be shared or sent. Leadership can view only.

## 2. Brand rules for AI marketing images and copy
- Every AI image request from posts, emails and campaigns gets the Harmonious rules added automatically:
  - palette, fonts and layout feel;
  - no pricing or fee numbers;
  - no offshore places;
  - no broken words;
  - glow only in the background.
- AI-drafted post and email text gets the same "no pricing, no offshore" rules. The same check as the Studio runs before a post can be submitted for approval, and any problem is shown on the post.
- A short **Brand rules** panel on the Collateral Studio page lists these rules for the team.

## Technical details
- Rendering: shared React layout components at fixed 1600×2000 sizes. Export is client-side, using an HTML-to-canvas library for JPEGs and a JS PDF library, with the brand fonts and logo embedded. Word wrapping uses `hyphens: none` and `overflow-wrap: normal`, plus a measurement check that flags any line that would overflow.
- New tables: `marketing_collateral` (template, settings, content, status, author, approver) and `marketing_collateral_events` (append-only history), with grants and RLS. They reuse the existing Marketing role checks and maker-checker.
- Saved exports go into the existing `marketing-assets` bucket and show up in the Drive & sheets library for tracked sharing and email attachments.
- `src/lib/marketing-brand.ts`: one module holding the brand rule text and the banned-content checker (pricing/fee amounts, Cayman/BVI/offshore). It is used by the Studio, `marketing-ai.server.ts` (the image and copy prompts) and the post/email submit checks.
- New route `marketing_.collateral.tsx` and a sidebar item under Marketing.
- Save the rules to project memory and record the module decision in `AGENTS.md`.

## Not included
- Editing the master logo file (the existing Harmonious logo is used).
- Automatic posting of collateral. Sharing still goes through approval.
