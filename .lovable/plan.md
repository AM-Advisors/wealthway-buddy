# Replace the Harmonious logo with the new version everywhere

## What changes

Swap the old lighthouse logo for the new uploaded version (teal wordmark with the new lighthouse mark) across the whole product: public site header/footer, app sidebar, sign-in page, portal gate, about page, favicon, and branded emails/PDFs.

The upload is a single teal-on-white image, so the other color versions are derived from it.

## Steps

1. **Prepare the artwork** (ImageMagick, from the upload):
   - Trim the white background and make it transparent.
   - Split into two files: the full wordmark and the standalone lighthouse icon.
   - Recolor each into the three existing variants: navy (#142647), white, teal (#5DC6D1) — flat single-color artwork makes this a clean recolor.

2. **Upload the six new files as CDN assets** and overwrite the six existing pointer files (`logo-navy`, `logo-white`, `logo-teal`, `logo-icon-navy`, `logo-icon-white`, `logo-icon-teal`) with the new asset URLs. No code changes needed — every page already reads through `src/components/Logo.tsx`.

3. **Update the favicon**: derive a square icon from the new lighthouse mark and replace `public/favicon.png`.

4. **Check branded emails and PDFs** for hardcoded old-logo URLs and point them at the new assets.

5. **Verify** in the preview: header, footer, sidebar, sign-in page, and browser tab icon all show the new mark.

## Notes

- The old logo assets stay on the CDN (immutable); only the pointers change, so this is fully reversible.
- Aspect ratios will shift slightly with the new artwork; existing fixed-height classes (`h-7`, etc.) keep layouts stable.
