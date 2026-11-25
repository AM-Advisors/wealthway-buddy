# Fund Compliance tab: SEC identifiers, filing prep, franchise fees, links and files

Each fund already has a **Compliance** menu item showing Form D / Blue Sky status, state filings, a calendar and franchise fees. This plan builds on that same page instead of adding a second one.

## What you will see on each fund's Compliance tab

1. **SEC identifiers** (new card at the top)
   - **CIK**: 10-digit number, shown to everyone with fund access.
   - **CCC** (EDGAR access code): saved privately, shown masked (`••••••12`). Only Harmonious staff can reveal it, and every reveal is logged with a reason.
   - **Offering type**: read from the fund's recorded regulation (506(b), 506(c), Reg A, Reg CF, etc.), so the right form is suggested.
   - Button: **Open EDGAR Filer Manager (EFD)** linking to the SEC's official filing site (https://www.edgarfiling.sec.gov), plus a link to the fund's public EDGAR page once a CIK is saved.

2. **Filings and accession numbers**
   - One list of the fund's SEC filings: Form D, Form D/A (amendment), Form C / C-U / C-AR for Reg CF, Form 1-A / 1-K for Reg A.
   - For each: filing date, **accession number** (format checked: `0001234567-26-000123`), and a link to the filed document on EDGAR.
   - Uses the existing filing records; corrections keep history.

3. **Prepare paperwork**
   - **Prepare Form D** (or D/A, or C, matching the fund's regulation) fills a draft from what's already recorded: fund name, CIK, issuer address, related persons, offering amount, sold-to-date, investor counts, first-sale date.
   - Shows **What's missing** before preparing.
   - Output is a downloadable draft PDF/summary to copy into EDGAR. Nothing is submitted, filed or paid automatically.

4. **Franchise fees** (existing card stays; small additions)
   - Add a **payment/confirmation link** and an attached receipt or notice to each fee.

5. **Links and files**
   - Add any link (state portal, registered agent, EDGAR page) with a label.
   - Upload files (filing confirmations, notices, CCC letters, state receipts). Private storage, fund-scoped.
   - Removing an item hides it but keeps history.

## Who can do what
- Fund managers and Harmonious staff with access to the fund: view, add CIK, accession numbers, links, files, prepare drafts.
- Only staff: reveal the CCC. Changing a saved CIK or CCC requires a reason and is logged.
- Investors never see this tab.

## Technical section
- Migration: `fund_sec_identifiers` (offering_id unique, cik, ccc stored in vault/encrypted with only last 2 kept plain, audit fields); `fund_compliance_links` and `fund_compliance_files` (offering_id, label, url / storage path, kind, removed_at); add `link_url`, `file_path` to `fund_franchise_fees`; add `form_type`, `edgar_url` to `fund_regulatory_filings`. GRANTs + RLS via existing fund-access helper; append-only event table for CIK/CCC changes and reveals.
- Private storage bucket `fund-compliance` with fund-scoped policies.
- Server functions in `fund-regulatory.functions.ts` (requireSupabaseAuth from `src/lib/require-auth.ts`); form-type mapping from `offerings.reg_type` in a pure `sec-form-model.ts` with tests (CIK/accession validation, reg→form mapping, missing-field list).
- Form D prep reuses `filing-forms.ts` / `marketing-formd-model.ts` builders.
- UI changes in `regulatory-tab.tsx` (new cards), no new menu item.

Sandbox validated only; no production records changed, nothing published.
