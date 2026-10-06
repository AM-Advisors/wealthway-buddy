# Post images that follow Collateral Studio's layout and rules

## What changes for the Marketing team
In a post's Images section, the image generator gets a **Brand layout** option. It's the default, and it builds the image the same way Collateral Studio builds its Social Announcement sheet:

- **Fixed layout:** headline, short subtitle, up to three value points, the "$24B+ AUA · 750+ Fund Managers · Your Funds On Easy Mode" footer and the Harmonious logo. It uses the Studio's colors, fonts, margins and corner glow.
- **Filled in from the post:** AI suggests the headline, subtitle and value points from the post's title and text. You can edit them in a small form before making the image.
- **Background art (optional):** AI can paint a background with no words in it, placed behind the layout. Because it never draws text, you won't get misspelled or broken words.
- **Sizes:** square 1080×1080 for Instagram and LinkedIn, or 1200×630 landscape for Facebook and LinkedIn link-style posts.
- **Same brand checks as the Studio:** if the text has prices or fees, or mentions Cayman, BVI or offshore, the image is blocked until it's fixed. So is text that overflows its box. Each problem is listed.
- The finished PNG is saved to the post like any other image, and it still goes through normal approval.

The current freeform "describe an image" generator stays available as **Freeform (AI)**. It keeps the brand image rules it already follows.

## Technical details
- Reuse `collateral-canvas.tsx` and the `social` template from `collateral-templates.ts`. Add a 1200×630 landscape variant, and add an optional background image layer under the content. The background never sits under the text glow.
- New server fn `suggestPostLayout(postId)` in `marketing-ai.server.ts` / functions. It uses `openai/gpt-6-astra` with a strict `json_schema` output of `{ headline, subtitle, points[≤3] }`, plus COPY_RULES. Results are run through `brandProblems`.
- The background reuses `generateImage` with an added "no text, no letters, abstract institutional fintech background" instruction and IMAGE_RULES.
- Rendering happens off-screen in the browser with `html-to-image` (already installed). The PNG uploads through the existing post image upload path to `marketing-assets`.
- Editing permissions and server checks don't change. Submitting a post still runs `brandProblems` on its text.
