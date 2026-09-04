# Apply the official Harmonious brand guide

Apply the uploaded brand guide (updated July 21, 2026) across the app, emails, and generated documents.

## What changes

### 1. Colors
- Primary navy: `#002753` → **`#142647`** (guide's official navy).
- Keep teal accent (matches the guide's primary teal swatch).
- Add near-black **`#221F20`** as the dark/text anchor and the brand **gradient `#142647 → #221F20`** for hero/footer/banner surfaces.
- Add secondary palette tokens (royal blue, sky blue, mint, violet, light blue) for charts, status accents, and highlights.
- Update both light and dark theme tokens in `src/styles.css`.

### 2. Typography
- Headers: **Rubik Bold**, title case ("First Letter Of Every Word Capitalized").
- Sub-headers: **Rubik Semi Bold**.
- Body: **Poppins Regular** (unchanged).
- Load Rubik via Google Fonts link in the root route head; add a `--font-heading` token and apply it to headings, card titles, and step titles site-wide.

### 3. Logo & brand assets
- Extract the official stylized "H" icon and HARMONIOUS wordmark from the PDF and use them in the site header, auth page, email templates, and investor portal (replacing any text-only or generic marks).
- Regenerate the favicon from the official H icon (keep the navy/teal favicon style consistent with the new navy).
- Regenerate the social-share (og:image) card using the brand gradient, official logo, and Rubik typography.

### 4. Email & PDF branding
- Update the email template colors to navy `#142647` headers, brand gradient accents, teal buttons, Rubik headings / Poppins body.
- Update the e-signed PDF summary header to the new navy and logo.

### 5. Voice (light touch)
- Where headings are currently all-caps or sentence case, adjust visible page headings to the guide's title-case rule. No copy rewrites beyond casing.

## Technical notes
- All color/font changes go through the design tokens in `src/styles.css` so components inherit them automatically; no hardcoded hex values in components.
- Logo images from the PDF will be copied into the project and served via Lovable Assets (favicon stays a real file in `public/`).
- Rubik loaded with a `<link>` in `src/routes/__root.tsx` (not a CSS @import).
- After approval I'll also update the saved branding memory so future work uses the new palette and fonts.
- Changes reach the live site on the next publish.
