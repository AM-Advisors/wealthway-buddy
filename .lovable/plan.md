# Whole-platform review: duplicates, blocked features, inactive screens and missing details

## Step 1: Audit (no changes)
I'll go through the whole platform, covering client, fund manager, investor, Operations, Sales, Marketing and public pages, and sort what I find into four groups:
- **Duplicates**: two or more screens, buttons or calculations that do the same job, for example two places to edit the same fund fact or two lists of the same records.
- **Blocked by a gate problem**: features that exist but can't be reached. Causes include a missing menu link, an access check that refuses people who should be allowed in, or a step that waits on something that never happens.
- **Not active**: screens nobody links to, unfinished features, switches that are off, and old pages that only redirect.
- **Missing details**: features that are partly built, such as a form without a save, a list that never gets data, a missing help article, or fields you can't enter yet. Known examples are tax ID and distribution banking on the investor page, and owners and signers as an editable form.

For each finding you get:
- where it is, in screen names you can open
- what's wrong and who it affects
- a suggested fix: **Merge**, **Fix access**, **Finish**, **Remove/redirect**, or **Leave as is**, with the reason
- a flag on anything covered by your standing rules: money movement, filings, tax payments, identity decisions, pricing, or approval of others' work. These are never "fixed" by opening them up.

You'll get the list as a short table in chat, grouped by area and with the most-used screens first, and you choose what to fix.

## Step 2: Fix what you pick
- Merges keep one shared screen and one shared calculation. Old addresses redirect so bookmarks still work. No records are deleted.
- Access fixes change only the specific check that's wrong. Every check stays on the server.
- Finished features reuse the existing shared engines and get a focused test for each rule.
- I also re-run the current test suite and fix the older failing menu and role checks along the way.

## What won't change
- Client, Operations and Sales stay separate.
- Approval steps, permanent history and the safety boundaries stay as they are.
- No real fund, investor or money data is changed.

## Technical details
- The audit is read-only. It covers route inventory against navigation.ts, host-routing.ts and the OPS_WORK_AREAS links, finds orphan routes and redirect-only stubs, and finds server functions with no callers and components that are never imported.
- It also looks for duplicate engines (fund setup, readiness, banking status, investor steps), role checks that disagree with ops-capabilities.ts, TODO/placeholder markers, and the current vitest failures.
- The fixes follow AGENTS.md rules and add a test for each changed rule.
