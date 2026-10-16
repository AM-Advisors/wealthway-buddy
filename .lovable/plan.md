# Help center inside the platform

## What you'll get
1. **Client help center** at Help in the client menu. You must be signed in to see it.
   - **By role:** Investor, Fund manager, Company / cap table admin, Professional (CPA/attorney).
   - **By service:** Funds & SPVs, Cap Table, Fund Administration, Tax & K-1s, Banking & wires, Signing documents, Identity verification, Billing & your plan.
   - Search across all articles, plus a "Contact Harmonious" button that opens a message to the client's team.
   - Clients only see articles for their own role, plus general articles.
2. **Staff help center**, on the Operations side only, at Operations → Help center.
   - **By staff role:** Operations, Account Manager, Finance, Compliance, Sales, Tax, Super Admin.
   - **By service:** the same service list, written as staff procedures. Examples: confirming a wire, approving a business check, sending documents for signature, recording migration payments.
   - A **Client help center** tab shows every client article exactly as clients see it, so staff can send the right link.
   - Staff articles never appear on the client side.
3. **Existing guides move behind sign-in.**
   - The two current public guides become articles: "Fund manager first login" and "Sign the operating agreement".
   - The old links still work. Signed-out visitors are asked to sign in, then land on the article. Links already sent, like Thomas's, keep working.
   - The guides are removed from search engines and the public site.
4. **Starter articles.** About 20 client articles and 15 staff articles, drafted from how the platform works today. Each is marked "Draft – review" until a Harmonious reviewer approves it. Clients only see approved articles. Staff see drafts with a badge.

## Out of scope
- No public help pages.
- No outside help-desk tool.
- Videos stay as they are, linked from articles where they exist.

## Technical details
- `src/lib/help-articles.ts` holds the article catalog as typed data: `slug`, `title`, `audience` (`client` | `staff`), `roles[]`, `services[]`, `body` (markdown), `status` (`draft` | `approved`), `updated`. A pure `articlesFor(audience, roles)` filter has unit tests: clients never get staff articles, and roles are filtered correctly.
- Approved and draft status is recorded in a new `help_article_reviews` table: slug, version, reviewer, timestamp, append-only. Approving is limited to Super Admin and Operations leads, never the article's own drafter. Staff read the table through RLS.
- Client routes are `/_authenticated/help`, `/help/$slug` and `/help/role/$role`, with a Help entry added to every client workspace menu in `client-navigation.ts`. It's always allowed by the menu limits (added to `ALWAYS` in `saas-order-model.ts`).
- Staff routes are `/_authenticated/ops/help` and `/ops/help/$slug`, registered in `ops-nav-registry.ts`, with a staff-role check on the server.
- `guides.*.tsx` become redirects to `/help/<slug>`. Their content moves into the catalog, and `head()` gets `noindex`.
- Search runs in the browser over the filtered catalog. No server search is needed.
