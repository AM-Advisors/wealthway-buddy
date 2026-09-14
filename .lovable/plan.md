# Legal pages and terms acceptance

Three public pages — Privacy policy, Terms of service, About — linked from the portal
footer and the website footer, plus the sign-in acceptance step kept in step with them.

## Pages

- **Privacy policy** (`/privacy`): the full text from harmonious.co, reproduced section by
  section, with the date refreshed and the contact, entity and service wording brought up to
  date (administration, technology, onboarding, reporting, payment facilitation,
  recordkeeping, compliance and regulatory support).
- **Terms of service** (`/terms`): a first draft for your legal review, written to match the
  Master Service Agreement and Statement of Work language already used across the platform —
  scope governed by MSA plus SOW, what Harmonious is and is not, portal use, electronic
  records, fees and invoicing, confidentiality and data, suspension and termination,
  limitation of liability, governing law. Nothing goes out as final until you approve it; I
  will flag every clause that needs your lawyer's input.
- **About** (`/about`): rewritten. Send me the copy you want and I will use it exactly; if you
  would rather I start, I will draft it from the mission and values already on the page plus
  the current service description, for you to edit.

All three get their own page title and description, and the shared header and footer, so they
look like the rest of the site.

## Footer links

Both footers gain Privacy policy, Terms of service and About:

- the signed-in portal footer, which today only has the signed-policies link and the support
  address
- the public website footer, which today links only to the service pages

## Accepting the terms

The portal already stops everyone at a sign-in acceptance screen until they have accepted the
current version of each document, and asks again whenever a newer version is published. That
stays as is and covers everyone who signs in, clients, investors, providers and staff alike.

What changes: the privacy notice and terms shown on that screen are currently short summaries.
I will publish them as new versions carrying the full text of the new pages. Because they are
new versions, every person is asked to accept again at their next sign-in, and the date, name
typed and version are recorded against their account as they are today.

## Technical notes

- New routes `src/routes/privacy.tsx` and `src/routes/terms.tsx`; rewrite `src/routes/about.tsx`.
  Body text lives in one shared module so the page and the acceptance screen cannot drift apart.
- Migration publishes version 2 of the `privacy` and `terms` rows in `policy_documents` with
  the full body and a current effective date; existing acceptances of version 1 stay on record.
- `PolicyGate`, `getPolicyStatus` and the acceptance recording need no changes.
- Footer edits in `src/components/portal-footer.tsx` and `src/components/site-footer.tsx`; add
  the new pages to the sitemap.
