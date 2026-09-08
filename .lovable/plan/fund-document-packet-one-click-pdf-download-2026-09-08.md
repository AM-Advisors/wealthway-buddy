# Fund document packet — one-click PDF download

Give admins a single **Download packet (PDF)** button next to each fund on the Funds page. It produces one branded Harmonious PDF containing everything an investor would receive for that fund: a cover page, the wire instructions, and every fund document in order.

## What the packet contains

1. **Cover page** — Harmonious navy/teal banner, fund name, Reg D 506(b) or 506(c) label, fund summary, minimum investment and target raise, open/closed status, generation date, and a contents list of the documents included.
2. **Funding instructions page** — the fund's saved wire details (bank name, account name, account number, routing number, SWIFT, memo) laid out as a labelled table, plus the existing fraud-warning language used elsewhere in the app ("verify details by phone using a known number; we never change instructions by email"). If no wire details are saved for the fund, the page says so plainly so the admin notices the gap rather than sending an incomplete packet.
3. **Every fund document**, in the same sort order shown on screen, each starting on a fresh page with its title, type, and whether a signature is required — same styling as today's per-document PDF.
4. **Page numbering and confidentiality footer** running continuously across the whole packet.

## Where the button lives

On the Funds page, in each fund's header row beside **Edit fund**. It shows "Preparing…" while the file is built and then downloads as e.g. `harmonious-growth-fund-i-packet.pdf`. If the fund has no documents yet, the button still works and produces the cover plus funding instructions.

## Access

Admin only, checked on the server the same way the other fund admin actions are — a non-admin request is rejected before anything is generated.

## Technical notes

- Extend `src/lib/offering-pdf.server.ts` with a `buildOfferingPacketPdf` that reuses the existing header/footer/wrap helpers and the shared page-drawing loop, refactored so both the single-document and packet builders share it. No new dependency; `pdf-lib` is already used.
- New admin-only server function `downloadOfferingPacket` in `src/lib/offering-documents.functions.ts`, taking `offering_id`, asserting admin, loading the offering, its `offering_wire_instructions` row and its `offering_documents` ordered by `sort_order`, and returning `{ filename, base64 }` like the existing download.
- Wire the button in `src/routes/_authenticated/admin.funds.tsx` using the existing `savePdf` helper and busy-state pattern.
- No schema changes, no changes to investor-facing flows, and the existing per-document PDF button stays as is.
