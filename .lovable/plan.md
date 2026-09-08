# Email preview: simulate a real investor

Make the admin email preview page show exactly what a specific investor would receive — their name, their fund, and their current place in onboarding — and let you send that exact version to yourself as a test.

## What you'll be able to do

1. **Pick a real investor.** A searchable list of existing applications (name, email, fund, current step). Choosing one fills in investor name, fund name, contact email, portal link, and the onboarding step automatically. Every field stays editable afterward.
2. **Or enter details manually.** A toggle switches to blank/manual mode with the same fields, for investors who don't exist yet.
3. **Choose the onboarding step.** A step picker (Identity, AML screening, Accreditation, Fund documents, Funding, Complete) that changes:
   - the email's headline and lead paragraph ("Continue where you left off" vs. the welcome wording),
   - the call-to-action label and link (verify identity / review accreditation / sign documents / fund your investment / view dashboard),
   - the subject line.
4. **See progress in the email.** The five-step list in the invitation email gets a completed / current / upcoming treatment: completed steps show a check and muted text, the current step is highlighted in teal with a "You are here" tag, later steps stay plain. This is real email-safe markup (tables and inline styles), so it renders the same in an inbox.
5. **Send this exact version as a test.** A recipient box (pre-filled with your admin email) and a **Send test** button under the preview. It sends the rendered version you're looking at, is admin-only, rate-limited to one send every 15 seconds, and shows a success or failure message plus the message ID. Sends are recorded in the existing delivery history so bounce/click tracking still applies.

Everything is admin-only and no existing email, template, or sending flow changes behavior for investors.

## Technical notes

- `src/lib/email-templates/investor-invitation.tsx`: add `currentStep` and optional `ctaUrl`/`ctaLabel` props; derive per-step headline, intro, CTA and subject from a shared `ONBOARDING_STEPS` list; render each step as completed/current/upcoming with inline styles. Existing default props keep current output for the no-step case.
- New `src/lib/email-templates/steps.ts` holding the step keys, labels, descriptions and dashboard paths, shared by template and preview UI (client-safe, no server imports).
- `src/lib/email-preview.functions.ts`:
  - add `listPreviewInvestors` (admin-only) returning application id, investor legal name, email, offering name, and `current_step`, joined across `investor_applications`, `profiles`, `offerings`, capped at ~100 and searchable by name/email.
  - add `sendPreviewTest` (admin-only): validates recipient, renders the chosen template with the supplied props via the existing render path, sends through the existing email helper with the same `from`/tracking wiring used by the composer, and writes a delivery log row. Reuse the current send helper rather than adding a new provider path.
- `src/routes/_authenticated/admin.email-preview.tsx`: add a "Simulate investor" card (mode toggle, investor combobox, step selector) above the existing sample-content card; keep the existing free-form field editor in sync when an investor is selected; add the send-test row beneath the preview frame with inline status.
- No database changes; reads use existing admin RLS paths.
