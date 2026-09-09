# Fund entity, EIN and banking details in Set up a fund

Add a new "Entity and banking" section to the fund setup wizard (and to the fund's page afterwards) that captures who the fund legally is, its tax ID, and how its bank account gets opened.

## What gets collected

**Legal entity**
- Legal entity name
- Type of fund: SPV, Private Equity, Venture Capital, Family Office, Hedge Fund, Other (free-text when Other)
- Entity type: LLC, LP, GP, Series LLC, Master LLC
- State formed, date formed

**Tax ID / EIN**
- Enter the EIN if they already have one
- If they don't: an "Apply for an EIN" panel with the Form SS-4 questions (responsible party name and SSN/ITIN, mailing and street address, county/state, reason for applying, closing month of accounting year, expected employees, principal activity, first date wages paid, third-party designee, applicant phone and signature name)
- A "Generate SS-4" button produces the real IRS Form SS-4 filled in with their answers, ready to download, sign and file. The form is stored privately with the fund so it can be downloaded again.

**Banking**
- Choice: "We already have an account" or "Have Harmonious open the account"
- If Harmonious opens it: pick Mercury, Texas Capital Bank, or Customers Bank, plus an optional note
- Saving that request emails your team so someone can start it, and the request shows with a status (requested / in progress / opened) on the fund page

## Privacy

Tax IDs and SS-4 answers contain sensitive personal information (a responsible party's SSN), so they are never stored alongside the publicly readable fund record. They go into the same locked-down storage the fund's bank wire details already use, readable only by admins and the fund's assigned managers. Investors never see them. The generated SS-4 PDF is kept in private file storage and only opened through a short-lived link.

Non-sensitive facts — legal entity name, fund type, entity type, state and date formed — are stored on the fund record itself, since they already appear on offering paperwork.

## Where it appears

- Set up a fund: a new step between "Fund details" and "Documents"
- The fund's admin page: the same details, editable later by admins and by managers assigned to that fund
- The EIN, entity type and formation details also become available for use on future fund paperwork

## Technical notes

- Migration: add `legal_entity_name`, `fund_type`, `fund_type_other`, `entity_type`, `state_formed`, `date_formed` to `public.offerings`. Create `private.offering_entity_details` (offering_id PK, `ein`, `has_ein`, SS-4 answer JSONB, `ss4_storage_path`, `ss4_generated_at`) plus security-definer RPCs `get_offering_entity_details` / `save_offering_entity_details` guarded by `can_manage_diligence(offering_id)`, mirroring the existing wire-instructions pattern. Create `public.offering_bank_setup_requests` (offering_id, `bank` enum-like text check for mercury/texas_capital/customers, `status`, `note`, requested_by, timestamps) with GRANTs, RLS restricted to admins and assigned managers, and an updated_at trigger.
- Zod schemas for every field, with length limits; EIN normalised to `##-#######`; SSN/ITIN validated by shape and never logged.
- Server functions in a new `src/lib/fund-entity.functions.ts`: `getFundEntity`, `saveFundEntity`, `generateSs4`, `getSs4Url`, `requestBankSetup`, `updateBankSetupStatus`. Privileged reads/writes go through the RPCs under `requireSupabaseAuth`.
- SS-4 generation: bundle the official IRS `fss4.pdf` as a project asset and fill its AcroForm fields with `pdf-lib` in a new `src/lib/ss4-pdf.server.ts` (same server-side approach as `offering-pdf.server.ts`), flatten it, and upload to a new private `fund-formation` bucket; downloads use signed URLs. Field names are read from the form's AcroForm at build time and mapped in one table so the mapping is easy to correct.
- Bank setup email: reuse `manager-alerts.server` / `sendTemplateEmail` with a new `bank-setup-request` template (fund, entity name, chosen bank, requester, note), idempotency keyed on the request id.
- UI: new `src/components/fund-entity-card.tsx` used by both `admin.setup.tsx` (new wizard step) and `admin.fund.$fundId.tsx`; shadcn Select/Input/Textarea, brand tokens only.
- Verification: typecheck plus a build, then load `/admin/setup` and a fund page, generate one SS-4 against sample data and visually check the rendered PDF pages.
