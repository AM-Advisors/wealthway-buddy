# One Marketing approvals queue, with no duplicates

## Problem
Marketing work waits for approval in four separate places today: social posts and emails (Calendar), editorial articles (Studio), collateral (Library) and personal LinkedIn posts. Managers have to check each one, and the same piece can show up twice when an article also has a matching post or email.

## What you'll get
- **One "Approvals" item in the Marketing menu**, with a count of what's waiting for you.
- **One list of everything waiting:** posts, emails, articles and collateral. Each row shows the type, title, who wrote it, when it's scheduled and what it's waiting on.
- **Easy approval:** each row has a big **Approve** button and a **Send back** button. Send back asks for a short note. One confirmation, then it's done. You can still open the item to read it first.
- **No duplicates:**
  - A post or email made from an article is grouped under that article as one row, not two.
  - When someone creates a post, email or article with the same title and date as one that's already open, a warning appears with a link to the existing one. They can still continue if it's truly separate.
- **Clear status:** rows you can't approve (for example, your own work, or a step that needs an executive) show "Waiting for another approver" or "Needs executive approval" instead of a button.
- The Overview gets a "Waiting for approval" panel that links to the queue.

## What stays the same
- Who can approve doesn't change. Authors still can't approve their own work, and executive steps still need an executive.
- Personal LinkedIn posts stay approved only by the profile owner. They show in the owner's queue only.
- Approved items still go live only at their scheduled time. Nothing publishes from the queue itself.

## Technical details
- New `marketing-approvals.functions.ts`: a reader that combines items already waiting (`marketing_posts`/emails `submitted`, studio items in review stages, collateral `submitted`, owner's LinkedIn `in_review`). It reuses each area's existing permission checks and returns `canApprove` + `reason` per row.
- Approve/Send back call the existing per-type transition functions (calendar action, studio transition, collateral review, LinkedIn action). There's no new approval engine and no change to the database rules.
- Grouping: posts/emails linked to a studio item collapse under it. If the link field doesn't exist, group only by an exact source reference, never by title.
- Duplicate warning: a pure `findLikelyDuplicates(title, date, kind)` helper, case-insensitive title and same day. Shown on the new-post, new-email and new-article forms. It only warns and never blocks or merges.
- New route `/marketing/approvals`, a sidebar item with a count badge, and an Overview panel.
- Tests: duplicate helper; queue hides Approve on the author's own items; LinkedIn rows show only to the owner.
