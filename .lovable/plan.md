# AI pre-check for accreditation proof

## What it does
Every time accreditation proof is uploaded (by the investor or by their CPA/lawyer), AI reads it automatically and checks it against the way the investor said they qualify (Income, Net worth, Professional license, Entity, or Letter from a professional).

Reviewers (fund manager or Harmonious) then see a short **AI pre-check** card on each pending accreditation:
- **Result:** Looks complete / Needs a closer look / Doesn't match.
- **What it is:** the kind of document AI found (for example "2025 Form 1040", "Brokerage statement", "CPA verification letter").
- **Checklist against the chosen basis**, each marked met, not met or unclear. For example:
  - Income: two recent years, amounts over $200,000 (or $300,000 joint), name matches the investor.
  - Net worth: statement dated within 3 months, credit report included, total over $1M excluding main home.
  - Letter: signed, dated within 90 days, names the investor, states accredited status, includes the professional's license number.
  - License: Series 7, 65 or 82, name matches.
  - Entity: assets over $5M or proof that every owner is accredited.
- **Warning signs:** name mismatch, old dates, missing pages or signature, edited-looking or illegible document, wrong document for the basis.
- A plain-language summary.

Reviewers can sort pending reviews so the "Looks complete" ones come first. That's where most of the time savings come from: clean files take seconds, and people spend their attention on the flagged ones.

## What stays the same (safety)
- **AI never approves or rejects.** A person still clicks Approve, with their name recorded. AI can't tell a forgery from the real thing with certainty, and 506(c) requires a person to take "reasonable steps." The card says so.
- AI results are saved permanently alongside the document. If someone re-runs the check, the new result is added and the old one is kept.
- AI is never asked for or given tax IDs, and the investor never sees the AI result.
- If AI is unavailable or out of credits, the review simply shows "AI pre-check unavailable" and works exactly as it does today.

## Technical details
- New append-only table `accreditation_ai_checks` (document_id, application_id, basis/method, verdict, document_kind, criteria jsonb, red_flags jsonb, summary, model, created_at); grants service_role only, append-only trigger; read through server functions with the existing reviewer authorization.
- `src/lib/accreditation-ai.server.ts`: downloads the file from private storage, calls the Lovable AI Gateway Responses API (`openai/gpt-6-astra`, streamed, strict JSON schema, low reasoning), with basis-specific criteria from `accreditation-evidence-options.ts`. Same error handling as `investor-document-ai.server.ts` (429/402 handled, no retries).
- Triggered best-effort after `recordEvidence` and `acceptUpload` (never blocks the upload); plus a "Re-run AI check" button for reviewers.
- `accreditation-reviews.tsx` (and the ops review list) show the AI card per document and a "Looks complete first" sort.
- Pure verdict helper + tests (any failed criterion or red flag means it can never read as "Looks complete"; missing AI result shows unavailable).
