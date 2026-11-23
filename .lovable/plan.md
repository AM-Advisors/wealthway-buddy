# Subscription agreement packet download

## What you'll get
A **Download subscription packet** button on each fund's Documents tab. It builds one polished PDF in the same style as the Erebor packet, from that fund's current approved documents. Nothing is hand-assembled, so the packet changes whenever the documents do.

Packet contents, in order:
1. **Cover**: fund name, the series/master line, fund manager contact, Harmonious branding.
2. **Fund at a glance**: minimum investment, fees and carry taken from the approved terms, close date and who to contact.
3. **How to complete this packet**: what to read, what to sign and on which page, and what to send back. Written in plain words.
4. **Document sections**: each one has a divider page that says "Read and keep" or "Sign", plus 2 to 4 short notes. Then the actual approved file follows: PPM, Operating Agreement, Subscription Agreement, any active side letter template and any other active investor-facing documents.
5. **Subscriber Information Form**: the same questions investors answer on screen, so paper and screen always match.
6. **Tax forms**: current IRS W-9, W-8BEN and W-8BEN-E, with one line explaining which form to fill in.
7. Page numbers ("Packet page X of Y") and a clickable table of contents.

Who can download it: Harmonious staff, plus that fund's own managers. The investor "Offering packet" card and the emailed packet links switch to this same packet, so everyone sees one version.

## What stays protected
- Only approved, current document versions are used. Drafts, sealed records and documents still awaiting approval are left out. A note on the guide page says which documents are missing.
- Wire instructions appear only for verified, released bank details, and only in copies sent to an investor who is cleared for funding. Staff and manager downloads say "Wire instructions are provided separately."
- Signed investor copies, identity documents and bank files are never included.
- Downloading changes no document, signature or approval. Each download is logged.

## Technical details
- New `src/lib/subscription-packet.server.ts` (pdf-lib): loads active approved `offering_document_versions` (excluding sealed records via sealed-records.server.ts), downloads each file from private storage, converts Word files with the existing document converter where available (otherwise lists them as "provided separately"), adds branded guide and divider pages, and merges everything with outline bookmarks. It reuses the fonts and colors of offering-pdf.server.ts.
- Exhibit pages are rendered from `standard-investor-questionnaire.json` and the onboarding intake model, as in the Erebor script. Tax forms ship as fixed files in a server-only assets folder.
- Pure ordering and labeling rules go in `subscription-packet-model.ts`, with a test: the order is PPM → OA → SA → side letters → other, and drafts and sealed versions are excluded.
- New server function `downloadSubscriptionPacketFn`, authorized for staff or a manager of that exact fund. It returns the PDF through a short-lived download, and the button uses the generate-then-download flow so it works on iPhone.
- `/api/public/packet/$token` and `getMyPacketLink` call the same builder, so the old text-only packet is retired.
- Rule recorded in src/lib/AGENTS.md.
- Verify with LaaSy and Erebor: download, check the page count and bookmarks, and look at the first pages.
