# Harmonious Classroom in Marketing

## What you get
A new **Marketing → Classroom** page where the team can:
1. **Bring articles over:** import all 55 articles from the live www.harmonious.co Classroom. Each keeps its title, author, dates, main image and alt text, category, search title and description, and its exact `/post/...` address.
2. **Review and publish:** every imported article starts as an unpublished draft. The author checks it and clicks Publish, and it goes live at `/post/<same address>` and on the Classroom page. Unpublish is always available.
3. **Refresh an article:** "Generate new version" uses AI to write updated text and a new branded image. The result is saved as a draft next to the original. The live version only changes when the author publishes the new one, and earlier versions stay in the history.
4. **Write a new article:** enter a topic, audience and key points, and AI drafts a full article with a branded image. You review it, then publish it.
5. **Edit:** change the title, text, image, category and search details. Each save creates a new version, and nothing is overwritten.

Per your choice, the author publishes directly with no second approval. Publishing and unpublishing are recorded in the activity history.

## Rules kept
- Imported text is copied as-is. AI only writes the new versions you ask for.
- Generated images follow the Collateral Studio brand rules: navy and cyan, no pricing, no offshore references.
- The public Classroom page and article pages show only published articles, and search engines are told to index only those.
- An article's address can't be changed after import, so existing search rankings carry over.

## Technical details
- New tables `classroom_articles` (slug unique, category, status draft/published/unpublished, current_version_id, wix provenance) and append-only `classroom_article_versions` (title, html, hero image, SEO fields, source import/ai_refresh/ai_new/edit, created_by). Grants plus RLS: marketing staff manage, while anon reads only published rows through narrow columns.
- New public `classroom-images` storage bucket for imported and generated hero images.
- Import runs as a staff-only server function. It fetches each slug from `WIX_ARTICLE_SLUGS` on www.harmonious.co, extracts the article body and metadata, sanitizes the HTML, copies images into the bucket, runs `validateArticle`, and upserts by slug (an existing published article is never overwritten). It reports progress and failures per article.
- AI text through Lovable AI Gateway (default model). Images through gateway image generation using the existing collateral brand prompt rules.
- `post.$slug.tsx`, `harmoniousclassroom.tsx` and the sitemap switch from the static `ARTICLES` array to a public server function that reads published articles. Head/OG tags come from article SEO fields.
- New route `_authenticated/marketing_.classroom.tsx` (list, filters, import button, new article) and `marketing_.classroom_.$id.tsx` (editor, version history, generate new version, publish/unpublish). A sidebar entry under Marketing is gated to Marketing roles; every action re-checks permissions on the server.
