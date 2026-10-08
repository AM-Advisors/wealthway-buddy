# Branded post designer: one logo, style choices, carousels

## What changes for the marketing team

**1. One logo only**
- Remove the small "HARMONIOUS" word at the top of every design. The white Harmonious logo stays once, in the bottom-right corner next to the proof points.
- If the footer is switched off, the logo moves to a top corner, so every image always carries exactly one logo.

**2. Pick a style** (shown as small preview thumbnails before saving)
- **Value cards** (today's look, cleaned up): headline, subtitle, three white cards.
- **Big statement**: one large headline with a cyan highlighted word, no cards. For bold one-liners.
- **Stat spotlight**: one big number (e.g. "$24B+") with a short label underneath.
- **Quote / testimonial**: large quote marks, quote text, name and role.
- **Checklist / tips**: numbered or ticked list of up to 5 lines.
- **Photo split**: a photo (generated, uploaded or from Drive) on one half, text on the navy half.
- **Event / webinar**: title, date, time, "Register" call-to-action.
- **Carousel** (see below).

**3. Carousel posts**
- Build 3 to 10 slides in one go: cover slide, content slides, closing slide with a call-to-action ("Book a demo", "Follow for more").
- "Fill from post text" writes the cover, each slide and the closing line; every slide stays editable and can be reordered or removed.
- Slide numbers (2/6) and a "Swipe" arrow on the cover; the logo appears only on the cover and last slide (one per slide, never two).
- All slides save to the post in order.
- Publishing: Instagram and Facebook post the slides as a real swipeable carousel / multi-photo post. LinkedIn stays unavailable as today.

**4. Extra options to make posts stronger**
- Sizes: Square 1080, **Portrait 1080x1350** (best for Instagram feed and carousels), Landscape 1200x630, Story 1080x1920.
- Background: plain navy, navy with cyan glow, light (white) version, or AI background art.
- Highlight: pick one word of the headline to color cyan.
- Optional call-to-action pill (e.g. "Learn more at harmonious.co").
- The existing brand checks still run (no pricing, no offshore wording, text that doesn't fit is flagged before saving).

## Notes
- I can't open the Instagram profile from here (it needs a login), so styles are based on your uploaded example and the existing brand rules. If you share 3 or 4 screenshots of favorite posts, I'll match them more closely.
- Nothing posts by itself: carousels go through the same approval step and Retry button as other posts.

## Technical details
- `src/components/marketing/post-brand-layout.tsx`: split into a style registry (one render function per template sharing BRAND tokens), remove the eyebrow text, single-logo placement rule, add size/background/highlight/CTA controls, slide list state for carousels; export each slide via html-to-image and upload in order, calling `onAdd` per slide.
- `src/lib/marketing-ai.server.ts`: extend `suggestPostLayout` with a `style` input and strict json_schema per style (stat, quote, checklist, event fields; carousel returns cover + slides[] + cta, 3-10 slides).
- `src/lib/marketing-publish.server.ts`: Instagram carousel (child containers with `is_carousel_item`, then `media_type=CAROUSEL` parent, then publish); Facebook multi-photo (upload each with `published=false`, then feed post with `attached_media`). Single-image path unchanged. Pass all signed `image_paths` (up to 10) instead of only the first.
- `postProblems`: Instagram carousel limited to 10 images.
- Tests for the slide limit and the multi-image publish request shape.
