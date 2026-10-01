# Screen protection: watermarks + blackout (all signed-in pages, everyone)

## Important limitation
No website can fully stop screen recording, OS screenshot tools, or a phone camera. This adds strong deterrents and makes any leak traceable to the person who took it.

## What users will see
- **Watermark** on every signed-in page: faint, tiled, diagonal text with the viewer's email, date/time, and a short session code. Repeats across the screen, cannot be clicked, and refreshes its timestamp every minute.
- **Blackout** — the page turns to a dark cover reading "Content hidden for security" when:
  - the browser tab is hidden or the window loses focus (returns when they click back)
  - the PrintScreen key is pressed (stays for a few seconds; clipboard is cleared where the browser allows)
  - someone tries to print — printouts come out blank with a "Printing disabled" notice
- **Copy limits**: text selection, right-click, drag, and Ctrl/⌘+C / S / P are blocked on signed-in pages. Form fields stay typeable and pasteable so onboarding and data entry still work.
- **Documents**: the same watermark sits on top of document previews and the diligence viewer.
- Public marketing pages and sign-in pages are unchanged.

## Logging
Blackout triggers (tab hidden, PrintScreen, print attempt, copy attempt) are recorded as append-only security events (who, when, page, type — no content), visible to Super Administrators in Administration.

## Technical details
- `src/components/screen-protection.tsx`: `ScreenProtection` wrapper mounted in `_authenticated/route.tsx` around `<Outlet />`; reads user email from the existing auth session.
- Watermark: fixed, `pointer-events:none`, high z-index SVG data-URI background; MutationObserver re-inserts it if removed via devtools.
- Blackout: `visibilitychange`, `blur`/`focus`, `keyup` PrintScreen, `beforeprint`; `@media print { body * { display:none } }` notice in `src/styles.css`.
- Copy guard: `user-select:none` on protected container (re-enabled for `input, textarea, [contenteditable]`), `copy`/`cut`/`contextmenu`/`dragstart` handlers.
- Iframe document previews get an overlay layer with the same watermark.
- Migration: `screen_protection_events` (user_id, event_type, path, created_at) with GRANTs, RLS insert-own, select for staff admins only; server function `logProtectionEvent` with throttling.
- Colors via design tokens; record rule in `src/lib/AGENTS.md`.
