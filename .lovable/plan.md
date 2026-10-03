# Marketing section

A new **Marketing** section in the staff sidebar (next to Sales and Account Management) where the marketing team designs social posts and emails, sends them for approval, and schedules them on a shared calendar.

## What the team gets

1. **Marketing dashboard** — what's scheduled this week, items waiting for approval, recent posts and emails, simple results (emails sent / opened / unsubscribed, posts published).
2. **Posts** — create a post once, pick the channels (LinkedIn, Instagram, Facebook), upload images, preview how it looks on each network, then submit for approval.
3. **Emails** — branded email builder (Harmonious templates: header, text, image, button, footer with unsubscribe link), live preview, send-test-to-myself.
4. **Audiences** — build email lists from Sales contacts, Clients / fund managers, Investors, and imported CSV lists. Unsubscribed people are always excluded automatically.
5. **Calendar** — month / week view of every scheduled and published post and email, color-coded by channel, filterable; click a date to create, drag-free reschedule from the item.
6. **AI help** — "Draft with AI" for post copy, email copy and subject lines in the Harmonious voice, plus AI image generation for post graphics.
7. **Channels** — page to connect the company LinkedIn page, Facebook page and Instagram business account, showing connected / needs reconnect.

## Approval rules
- Every post and email goes Draft → Submitted → Approved → Scheduled/Sent. The approver must be a different person from the author.
- Editing an approved item sends it back to Draft.
- Nothing publishes or sends without approval; the scheduler only picks up approved items at their scheduled time.
- Published/sent items are locked; history is kept, never deleted.

## Who can use it
- New staff roles: **Marketing Manager** (can approve) and **Marketing Specialist** (create/submit). Executive, CEO and Super Admin can also approve.
- Marketing gets its own team dashboard and shows in the Employees page like other teams.

## Connecting the social accounts
- **LinkedIn**: uses the built-in LinkedIn connection. I'll open the connect card; the company page needs admin access and posting permission for organization pages.
- **Facebook & Instagram**: there's no built-in connection for these, so they post through Meta's official API using a long-lived Page access token from your Meta Business account (Instagram must be a Business account linked to the Facebook page). I'll ask you to paste the token securely; until then those channels show "Not connected" and posts for them can't be scheduled.
- Instagram requires an image on every post — the editor will enforce that.

## Emails
- Send through Brevo (already connected) from the Harmonious marketing address, with a working unsubscribe link (also fixes the missing-unsubscribe gap on sales emails' shared list). Sending is batched and logged per recipient.

## Technical details
- Migration: `marketing_posts`, `marketing_post_targets` (per channel, external post id, status), `marketing_emails`, `marketing_audiences` + `marketing_audience_members`, `marketing_email_sends`, `marketing_approvals` (append-only), `marketing_assets` (storage bucket `marketing-assets`), `marketing_channels`, `email_unsubscribes`; new `app_role` values `marketing_manager`, `marketing_specialist`. GRANTs + RLS, writes via server functions only.
- `src/lib/marketing.server.ts` / `marketing.functions.ts` (requireSupabaseAuth from `require-auth.ts`, server-side role + maker-checker checks), `marketing-publish.server.ts` (LinkedIn `/rest/posts` via gateway with organization URN; Meta Graph `/{page-id}/feed`, `/{ig-id}/media` + `media_publish`), `marketing-ai.server.ts` (Lovable AI for copy and images).
- Scheduler: `/api/public/marketing/run` cron endpoint (secret-verified) every 5 minutes via pg_cron, publishing approved items due now; idempotent claim per target.
- Public `/unsubscribe/$token` page.
- Routes: `/ops/marketing`, `/ops/marketing/posts(/$id)`, `/ops/marketing/emails(/$id)`, `/ops/marketing/audiences`, `/ops/marketing/calendar`, `/ops/marketing/channels`; sidebar section in `ops-sidebar.tsx`; marketing team in `staff-directory.server.ts`; note in `src/lib/AGENTS.md`.

## Not included
- No pulling comments/likes from social networks (publishing only, plus counts where the API returns them).
- No personal employee social accounts (company pages only, as chosen).
