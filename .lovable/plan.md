# Check for missing pieces, duplicates and broken links

This is a review first. I'll report what I find before I change anything.

## What I'll check

1. **Missing pieces after the fund page reorganization**
   - Every section that used to be on the fund page (fund details, team, to dos, requests, calendar, audit history, banking, documents, questions) still appears somewhere in the eight tabs.
   - Each old tab link, email link and menu link opens a real spot. None lands on a blank page.

2. **Things showing in more than one place**
   - The same card or list showing on two tabs, like the to-do list, summary numbers, team and signers, or fees and terms.
   - Approve buttons for the same item on several screens that could confuse people.

3. **Things sending to multiple places**
   - Emails and alerts (investor invitations, onboarding links, progress emails, approval notices, Operations Slack notices, verification alerts) that could go out twice for one event, or to the wrong people.
   - Links in emails and work lists that point to old or different screens for the same task.

4. **Records saved in two places**
   - A recheck of the earlier duplicate-data findings (identity, screening, funding) to confirm every page now reads one source, plus a look at side letters, class assignments and signed documents.

5. **Live issues**
   - Recent error logs, failed emails and failed background jobs.

## What you'll get

A plain list grouped as: missing, duplicated, sending twice, and errors. Each item will say where it is and the fix I suggest. I'll make fixes only after you pick which ones to do.

## Limits

- I won't change approvals, money, identity or signed records during the review.
- I can't sign in with your authenticator, so I'll check the code, saved records and the logs, not the signed-in screens.

## Technical details

- Compare `fund-tab-map.ts` redirects with all `?tab=` / `section=` links across `src/` and email templates.
- Search for components that render more than once across fund tab panels.
- Map each notification sender to its trigger points and look for duplicate calls or missing dedupe keys.
- Read-only database queries for duplicate email-log rows by event and recipient, and for mismatched duplicated fields.
- Review `/tmp/observability` logs and recent job/email failures.
