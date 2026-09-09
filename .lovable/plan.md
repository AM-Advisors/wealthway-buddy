# Fund compliance checklist, and more offering types

Two related changes: fund setup stops assuming every fund is a Reg D private placement, and every fund gets a compliance checklist with a progress tracker on its page.

## 1. More offering types in fund setup

The offering type dropdown becomes:

- Reg D 506(b) — private, no general solicitation
- Reg D 506(c) — publicly marketed, accreditation must be verified
- Reg CF — crowdfunding
- Reg A Tier 1
- Reg A+ Tier 2

Everywhere the fund's type is shown today (fund pages, manager panel, investor rail, packets, PDFs) picks up the new labels.

**What this means for investors.** Only 506(c) demands third-party verified accreditation, so that stays as is. 506(b) keeps its "how do you know the fund" question. Reg CF and Reg A funds behave like 506(b) for now — the investor still completes identity, screening, documents and funding, and self-attests accreditation status, which is recorded but not required to pass. Reg CF and Reg A investment caps are not enforced in this change; if you want those, say so and they become a follow-up.

## 2. Fund compliance checklist

A new "Compliance" section on the fund page (admin) and on each manager's fund home, listing the filings a fund has to make, each with:

- Status: not started, in progress, filed, not applicable
- Due date and filed date
- Who owns it
- A note and an optional reference number (for example the filing confirmation)

**Starter items created with each fund**, tailored to the offering type:

- Form D — initial filing, and the annual amendment
- Blue Sky / state notice filings, with a line per state you add
- Form 8940 — miscellaneous determination request
- Form 8946 — PTIN application for a foreign preparer
- EIN / Form SS-4 (mirrors what operations already tracks)
- Reg CF: Form C, Form C-AR annual report
- Reg A / A+: Form 1-A, Form 1-K annual, Form 1-SA semi-annual, Form 1-U current report

Managers and admins can add their own items, edit any of them, mark them not applicable, and delete ones they added. Items are per fund; nothing is shared between funds and investors never see them.

**Progress tracker.** A bar and a "x of y filed" count above the list, with overdue items called out in red and the next due date shown. The same percentage appears on the fund cards in the manager panel next to the setup percentage.

## Technical notes

- Migration:
  - `ALTER TYPE public.reg_type ADD VALUE` for `regcf`, `rega`, `regaplus` (each in its own statement; existing `506b`/`506c` untouched).
  - `public.fund_compliance_items` — `offering_id`, `key` (nullable, set on seeded items), `label`, `category`, `status` (`not_started`/`in_progress`/`filed`/`not_applicable`), `due_date`, `filed_on`, `owner_name`, `reference`, `note`, `sort_order`, `created_by`, timestamps, plus the `set_updated_at` trigger. GRANT select/insert/update/delete to `authenticated` and all to `service_role`, no `anon` grant; RLS restricted to `public.can_manage_diligence(offering_id)` — the same admin-or-assigned-manager rule the rest of the fund tooling uses.
- `src/lib/compliance.functions.ts`: `getFundCompliance`, `saveComplianceItem`, `deleteComplianceItem`, `seedComplianceChecklist` — all under `requireSupabaseAuth` with the existing admin/`fund_managers` authorisation helper. Seeding is idempotent on `(offering_id, key)` and runs when the fund page first loads an empty checklist, so existing funds get the list too.
- Template definitions live in `src/lib/compliance-templates.ts`, keyed by offering type, so adding a filing later is a one-line change.
- `src/lib/offerings.functions.ts`: widen the `reg_type` Zod enum; add exported `REG_TYPES` with label/short-label/description and a `regTypeLabel()` helper. Replace the ad-hoc `reg_type === "506c" ? … : …` ternaries in `admin.setup.tsx`, `admin.fund.$fundId.tsx`, `admin.funds.tsx`, `admin.access.tsx`, `admin.wire.tsx`, `manager-fund-home.tsx`, `step-rail.functions.ts`, `application-checklist.tsx` and `offering-pdf.server.ts` with that helper.
- Accreditation and room-KYC branches: keep `506c` on the verified path; treat every other type on the current `506b` path, but only require the pre-existing-relationship answer for `506b` itself.
- `src/components/fund-compliance-card.tsx`: progress bar, counts, overdue and next-due badges, item rows with inline edit, add-item form. Mounted on `admin.fund.$fundId.tsx` and `manager.fund.$fundId.tsx`; the compliance percentage is added to `getManagerFundProgress` for the manager panel cards.
- Verification: typecheck and build, then open a fund page, seed the checklist, mark one item filed and confirm the tracker and the manager panel card both move.
