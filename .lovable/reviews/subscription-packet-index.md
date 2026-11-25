# Subscription packet index and guidance

## Scope

Updated the existing shared subscription packet builder used by fund Documents and authorized packet links. No uploaded agreement wording, signed originals, approval rules, identity checks, tax certifications, funding controls or production records changed.

## Contents

- Printed index immediately after the cover, with section, action and exact linked packet page number.
- Index continuation pages for long packets; packet numbers assigned after all index pages are inserted.
- Completion checklist generated only from included approved, unsealed documents, with exact-version destinations so duplicate titles do not mix links.
- Onboarding instructions follow About You, Verification, Sign and Fund, with direct links back to the index and checklist.
- Checklist ticks are personal paper guidance, never recorded verification, signatures or approvals.
- Wire instructions indexed only when the existing authorized caller supplies them.

## Verification

- Seven tests passed across subscription-packet-model.test.ts and subscription-packet.server.test.ts.
- Generated fictional standard, long and wire-inclusive packets: 22, 83 and 23 pages.
- All internal destinations resolved: 21, 77 and 22 links respectively.
- Inspected rendered index, summary, instructions, checklist, long-index continuation and long-checklist continuation pages using the PDF skill workflow.
- Initial checks found off-by-one expected section counts and TypeScript test narrowing issues; corrected expectations and guards, then reran successfully.
- Long-title stress test confirmed wrapping, separate action/page columns and pagination. Final visual inspection found no clipping or overlaps on the new pages.
- Latest preview build passed. Actual authorized production download remains unverified; no live data used and nothing published.

Sandbox validated; production verification pending.