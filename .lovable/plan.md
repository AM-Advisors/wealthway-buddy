# Separate signature pages for template fund documents

## What changes for the user
- **Signing is split by who signs.** Every Harmonious template document (Operating Agreement, Subscription Agreement, side letters, LLOA, and so on) on any fund gets its own **Fund manager signature page** and **Investor signature page**, instead of one shared signing block in the document.
- **Signing order is a choice.** When sending, the sender picks: Investor first then fund manager (default for subscriptions), Fund manager first then investor, Fund manager only (default for the Operating Agreement), or Investor only. The choice is saved per document and can be changed until anyone has signed.
- **Investor signature pages are made automatically.** For each investor on the fund, Harmonious builds their signature page already filled in: legal name, entity name and signer title (for entities), commitment amount, class, address and date line. Joint investors (for example Robert and Chaunntel Pettit) get a block for each signer.
- **Full document or signature page only.** Clients choose per document:
  - **Full template** — the whole filled document plus the signature page, signed in one pass.
  - **Signature page only** — the investor reads the full document in the pop-out viewer but signs just their short signature page. Best for funds that already have their own agreements or migrated funds with existing signed documents.
- **The final signed copy** joins the document with all completed signature pages and is filed in the fund's Documents tab and the investor's Documents, logged in Audit History.

## Other automation included
1. **Send to all investors at once** — one click builds and sends each investor's signature page; investors still missing a name, email or verification are listed and skipped instead of blocking the batch.
2. **Countersign batch for the fund manager** — once investors sign, the fund manager gets one email and countersigns all waiting pages in a single session.
3. **Automatic reminders** — optional reminder after 3 and 7 days for unsigned pages, using the existing branded reminder email (operations@ CC'd), with the daily limit kept.
4. **Auto-refresh before signing** — if fund details change before anyone signs, signature pages rebuild automatically; once someone signs, the version is locked.
5. **Slack alert when a fund's full packet is signed**, using the existing Operations alert.

Nothing goes out without a person clicking Send, and identity checks still apply before investors can sign.

## Steps
1. Add signature-page templates (fund manager page, individual investor page, entity investor page, joint signers page).
2. Store each document's signing order and "full / signature page only" choice; default by document type.
3. Generate per-investor signature pages filled from investor and fund records.
4. Update the Send for signature window with order and mode choices, and add Send to all investors and Countersign all.
5. Join signed pages with the document into a final copy, file it, and log it.
6. Add optional reminders and the full-packet Slack alert.
7. Test on Dev Test 1 with one individual, one entity and one joint investor, in both modes and each order.

## Technical details
- New columns on the fund document record: `signing_order` (enum investor_first | manager_first | manager_only | investor_only) and `signing_mode` (full | signature_page); additive, nullable with defaults.
- New per-investor signature-page records linked to the document version and investor/investment, each with its own signature request; existing two-step signing flow drives order.
- Signature page DOCX templates filled with the same template-value engine used for fund templates, converted to PDF; final merge appends signed pages to the document PDF.
- All sends, countersigns, and regenerations checked server-side (staff or authorized fund managers for that fund); signed versions are never overwritten.
