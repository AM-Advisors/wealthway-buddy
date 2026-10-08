# Harmonious Marketing Studio — Assessment and Phase 1 Plan

## 1. What already exists and will be reused
- **Marketing area** (/marketing) with menu, roles (marketing manager, marketing specialist; approvers: manager, executive, admin, super admin) and server-side role checks.
- **Social posts** with drafts, submit, second-person approval, scheduled publishing, failed-post retry, and the branded post designer (8 styles, carousels, real logo).
- **Calendar** (month/week) for posts and emails with approval actions.
- **Classroom articles** with versions, AI drafts, published-only public pages and fixed /post/<slug> addresses — this becomes the article side of each series.
- **Campaigns, email flows (rep-confirmed sends), audiences, Content library (Drive, Collateral, Imports), Channels** (Facebook/Instagram live, LinkedIn company page unavailable until approved).
- **AI drafting** through the built-in AI service, on the server.

Nothing above will be duplicated or overwritten; the public website is untouched.

## 2. What Phase 1 adds
- **Five permanent series**: Market Monday (Signal), Thesis Tuesday (POV), Whatever Wednesday (Human), Fund Academy Thursday (Teach), Founders Friday (Connect) — each with its own color, badge, voice notes, default outputs and source list, under the Harmonious master brand.
- **Content items** (one per planned piece) holding every field the brief lists: series, date/time, article title, social headline, topic, audience, keywords, source links, author, reviewer, status, platforms, graphic needs, article link, CTA, results. Each item can link to an existing post, article or email rather than copying it.
- **11-step workflow**: Idea → Researching → Drafting → Fact Check → Design → Internal Review → CEO Approval → Approved → Scheduled → Published → Performance Review. Moves are checked on the server; CEO Approval and Approved need a different person than the author; nothing goes public without approval (existing publish approval still applies too).
- **Comments, version history and an append-only activity log** on every item.
- **Weekly slots**: a "Plan this week" button creates five proposed slots (one per series) that can be replaced; it never runs on its own and never duplicates an existing week.
- **Roles**: add Marketing Contributor, Compliance Reviewer and Executive Approver, mapped onto the existing marketing roles so current staff keep access.

## 3. Screens
- **Studio dashboard** (/marketing/studio): This week's content, today's item, awaiting approval, scheduled, published, plus panels for market stories, SEC/IRS updates, opportunities, SEO, engagement, traffic and leads — those last panels show clearly labeled SAMPLE content until live sources are connected in a later phase. Weekly/monthly summary cards.
- **Editorial calendar** (/marketing/studio/calendar): Month, Week, Day, Kanban (by workflow step) and Campaign timeline; drag to reschedule or change step, filters by series/status/platform/owner, duplicate item.
- **Item editor** drawer: all fields, workflow buttons, comments, history.
- Look: "financial terminal meets editorial workspace" using existing Harmonious colors and Rubik/Poppins, dense data cards, series color bars; works on phone, tablet and desktop.

## 4. Integration reuse plan (later phases, not built now)
- News/regulatory discovery (SEC, EDGAR, IRS, FinCEN, Treasury feeds) feeding suggested opportunities.
- AI drafting per series voice, reusing the current AI drafting; Founders Friday never invents experiences or opinions for Alyssa and always requires her approval.
- Publishing through existing Facebook/Instagram and, once approved, LinkedIn company page; articles through Classroom.
- Analytics from existing publish results and site analytics.

## 5. Phased checklist
- Phase 1 (this step): series, content items, workflow, comments/history/log, roles, weekly slots, dashboard, calendar views, labeled sample panels, tests for workflow and approval rules. Then stop for review.
- Phase 2: source discovery and opportunity scoring.
- Phase 3: AI drafting per series, fact check with cited sources, graphics from the post designer.
- Phase 4: scheduling and publishing hand-off to existing approved channels.
- Phase 5: SEO/GEO tools and performance analytics.

## Technical details
- New tables: marketing_series (seeded with the five), marketing_content_items, marketing_content_item_versions and marketing_content_item_events (append-only), marketing_content_comments; RLS limited to marketing roles; new app_role values for contributor, compliance reviewer, executive approver.
- Pure workflow model (allowed transitions, who may perform each) with unit tests; server functions with requireSupabaseAuth enforce it.
- Optional links to existing marketing_posts, classroom_articles and marketing_emails by id.
- Record the studio architecture rule in AGENTS.md.
