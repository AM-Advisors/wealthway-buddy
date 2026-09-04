# Email template preview page

An admin-only page that renders each Harmonious email exactly as an investor's mail client will show it, so branding can be checked without sending anything.

## What you get

A new page at `/admin/email-preview`, linked from the admin console:

- A list of the available email designs (today: the investor message used by the composer).
- The subject line shown above the preview, exactly as it will appear in the inbox.
- The email itself rendered inside a framed panel at real email width, using the same code that produces the sent message — same navy heading, teal top border, Poppins type, white background and footer.
- Editable sample fields (investor name, offering name, subject, message body) so you can see how your own wording will look. Changes re-render the preview instantly.
- A desktop / mobile width toggle to check narrow screens.
- Nothing is sent and nothing is recorded; the page only renders.

## Technical notes

- New server function `renderEmailPreview` in `src/lib/email-preview.functions.ts`: POST, `requireSupabaseAuth` + admin check (same `assertAdmin` pattern as `src/lib/admin.functions.ts`), Zod input `{ templateName, data }`. Looks the template up in `TEMPLATES`, renders with `render()` from `@react-email/render`, resolves the subject (string or function), returns `{ subject, html }`. Server-side only so React Email never enters the client bundle.
- New route `src/routes/_authenticated/admin.email-preview.tsx` (`createFileRoute("/_authenticated/admin/email-preview")`), with its own `head()` metadata. Uses `useServerFn` + `useQuery` keyed on the template name and sample data (not a loader, since the function is auth-protected).
- The rendered HTML is displayed in a sandboxed `<iframe srcDoc={html} sandbox="">` so the email's own styles are isolated from the app.
- Template list comes from `TEMPLATES`; each entry's `previewData` seeds the editable fields, so new templates appear here automatically once registered in `src/lib/email-templates/registry.ts`.
- Add a link to the page from `src/routes/_authenticated/admin.index.tsx`.
- No database changes, no new dependencies (`@react-email/render` is already used by the existing preview route).
