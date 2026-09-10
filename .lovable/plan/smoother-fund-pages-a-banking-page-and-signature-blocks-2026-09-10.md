# Smoother fund pages, a banking page, and signature blocks

## What changes for you

**1. The fund page gets calmer**

Today the fund page repeats itself: wire instructions appear twice, banking is
split between three cards, and everything is one long stack. It becomes a
header (name, status, key numbers, agreement and scope) followed by clear
tabs:

```text
Overview   Documents   Banking   Investors & funding   Compliance   Settings
```

- Overview: description, scope summary, services in and out of scope, third
  party providers, timeline of what still needs doing.
- Documents: the offering documents, uploads and signature blocks.
- Banking: opens the new banking page (below).
- Investors & funding: commitments, wires, deposits matched to investors.
- Compliance: the existing compliance checklist and entity/EIN card.
- Settings: public page settings, packet email, fund setup link.

Nothing is removed — the duplicate wire card disappears and each card lands in
one obvious place. Scope rules, blocks and warnings behave exactly as they do
now.

**2. Banking becomes its own page**

A dedicated banking page per fund with two clear paths at the top:

- *Enter the account details yourself* — a form for the receiving bank, account
  name, account number, routing (ABA), SWIFT and reference/memo, plus ACH
  details. Saving requires re-typing the account number to confirm, and each
  change is written to the audit trail with who changed it and the old value.
- *Apply through Harmonious* — the existing request to have Harmonious help
  open the fund's account (Mercury, Texas Capital, Customers Bank), with its
  current status shown and progress updates from operations.

Below the two paths the page also carries the connected account and incoming
deposits, and the wire tracking that lives on the fund page today. The fund
page keeps a short banking summary card that says whether instructions exist
and links here.

Fund managers and Harmonious staff can both use it. The existing scope check
still applies: if banking is not in the client's active scope, the page shows
"This service is not currently included in your active scope. Request service."

**3. Uploading fund documents**

Uploads already accept PDF and Word; the Documents tab makes it obvious:

- Drag a file onto the card, or browse. PDF, DOC and DOCX are named on screen.
- An "Add document" button creates a new fund document straight from an upload
  (title, type, whether a signature is required) instead of going to Fund setup.
- Each document shows its file, size, when it was uploaded and who by, with
  replace and remove.

**4. Signature blocks the client places**

On a PDF document the client opens "Place signature blocks", sees the actual
pages, and drags boxes where investors must sign:

- Block types: signature, initials, date signed, full legal name, title/capacity.
- Each block sits on a page at the spot chosen, can be resized, and marked
  required or optional.
- Blocks are saved per document and shown as a summary ("3 blocks on 2 pages").
- When an investor signs, the typed signature, initials, date and name are
  stamped into those exact positions on the signed PDF they download, along
  with the existing audit footer (timestamp, IP, document hash).

Word documents can be uploaded but blocks need a PDF — the screen says so and
offers the signature page fallback used today.

## Technical notes

- New table `offering_document_signature_blocks`: offering_document_id,
  page_number, x/y/width/height as page fractions, block_type, signer_role
  (investor for now), required, sort_order, created_by. RLS: read for anyone
  who can view the offering's documents; write for fund managers of that
  offering and staff with fund authority. GRANTs for authenticated and
  service_role.
- `src/lib/signature-blocks.functions.ts`: list, save (bulk replace), delete —
  all behind `requireSupabaseAuth` and the existing `assertCanManageFund`.
- Page rendering is client-side with `pdfjs-dist` inside a `ClientOnly`
  placement editor, reading the file through the existing signed-URL server
  function; no server-side PDF rasterising.
- `signed-pdf.server.ts` gains a branch: when the source document has an
  uploaded PDF and blocks, load it with `pdf-lib` and draw the signer values at
  the stored coordinates, then append the existing audit page. Documents with
  no file or no blocks keep today's generated output unchanged. Box Sign path
  is untouched.
- Banking: new routes `/admin/fund/$fundId/banking` and
  `/manager/fund/$fundId/banking` rendering one shared `FundBanking`
  component that composes the existing wire-instruction save RPC,
  `requestBankSetup`, `BankFeedPanel` and `WireTrackingPanel`. Wire
  instructions continue to go through `save_wire_instructions` /
  `get_wire_instructions`, so masking and access rules are unchanged.
- Fund page refactor uses the existing shadcn `Tabs`; every card keeps its
  current `ScopeSection` wrapper so scope gating is preserved. The duplicated
  "Funding details" card is removed in favour of the banking summary.
- New dependency: `pdfjs-dist` (worker bundled through Vite).
