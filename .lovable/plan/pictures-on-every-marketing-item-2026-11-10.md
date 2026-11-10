# Pictures on every marketing item

## What you'll get
On social posts, emails, articles and collateral, a new **Picture** panel in the editor.

**1. Choose the picture (any source)**
- Upload your own
- Pick from the Marketing Library
- Create with AI from the item's title and text, in Harmonious colors (navy, teal), with no pricing or outside-platform names

**2. Choose how it's shown, each time**
- **Behind the text:** picture as the background, with a navy shade so text stays readable (adjustable strength)
- **Placed inside:** picture above the text, or beside it
- **Branded frame:** picture inside a navy/teal Harmonious frame with logo
- **Picture only**

**3. Live preview** matches the chosen layout before saving; Download (already built) exports the finished image.

## Where it applies
- Social posts: finished image is attached to the post's images.
- Emails: picture is placed in the email (header or inline); background style becomes a header image so it shows in all email apps.
- Articles: cover picture and in-article pictures.
- Collateral: background or placed picture on the design.

## Unchanged
Approvals, who can publish, scheduling and existing images. Editing a picture on an item already approved sends it back for approval as today's edits do.

## Technical details
- Reuse post-brand-layout capture and design-canvas; add shared `MarketingPicturePanel` with source tabs and layout options.
- AI images via Lovable AI image generation in a server function, saved to existing marketing storage and Library.
- Store layout choice with each item (small migration adding picture/layout fields where missing); tests for layout choice saving and email fallback.
