# Easier fund setup (staff and fund managers)

## 1. One guided setup page
Staff and fund managers use the same page, with six steps in order:

```text
1 Fund details -> 2 Team -> 3 Fees & terms -> 4 Bank / wire -> 5 Documents -> 6 Review & launch
```

- Each step shows what's on file, what's missing, and one primary button.
- Staff see "Save" (and approve manager suggestions inline). Fund managers see "Submit for review", as today.
- The current scattered sections (Fund Details, Team, Banking, Documents tabs) link into the matching step, so nothing is removed.
- Setup % keeps coming only from the existing launch summary, so the number matches everywhere.

## 2. Who's waiting on whom
- Each step carries a clear label: "Waiting on fund manager", "Waiting on Harmonious", "Needs changes" or "Done". The label names the person: the fund manager, or the assigned Operations team member.
- Page header: "3 items waiting on you" for whoever is viewing.
- **Remind** button. Staff can remind the fund manager by email. A fund manager can nudge Harmonious, which posts to the existing Operations Slack alert and tags the assigned person. One reminder per step per day, and every reminder is logged.

## 3. Smart defaults
- New funds start with standard choices pre-filled and marked "Default — confirm": Delaware, LLC, 506(b), state of solicitation "All states", Harmonious as fund administrator (unless the client is SaaS-only), and the Harmonious rate card closing cost.
- Defaults never count as complete until someone confirms them with one click ("Confirm defaults").
- Fees are not defaulted. They must come from the fund's documents or a person.

## 4. Fill from Drive (staff only)
- A **Fill from Google Drive** button appears on a fund that has a Drive folder link.
- It reads only files whose names match setup documents (Form D, Certificate of Formation, Operating Agreement, EIN letter, close sheet) and pulls out proposed values: legal name, entity type, state, formation date, address, minimum investment, raise amount, related persons, fees, first sale date.
- Results appear as a **review list**, never saved automatically. Each row shows the value, the file it came from and an Accept / Skip button. Accepted values go through the normal setup save, with history.
- It never copies or shows tax IDs, SSNs or bank account numbers, and never changes Drive sharing.
- Fund managers don't run it, but they see the accepted values as "On file".

## Not changing
Approval rules, peer review, money and banking boundaries, investor onboarding, and who can launch a fund.

## Technical details
- New `src/components/fund-setup-guided.tsx`, used by both `ops.fund.$fundId` (Setup tab) and `manager.fund.$fundId.settings` / Overview. It replaces the `FundManagerSetupLoader` render and reuses `submitFundInfoFn`, the canonical fund-setup save functions and `listSubmissions().onFile`.
- `src/lib/fund-setup-waiting.ts` (pure): step -> owner/status projection from submissions, launch summary tasks and team assignment. Covered by unit tests.
- Reminders: `fund_setup_reminders` table (append-only, dedupe per step/day). The server fn checks that the caller is staff or that fund's manager. Staff -> fund manager uses the existing transactional email. Manager -> Harmonious uses `ops-slack-notify.server.ts`.
- Defaults: applied at fund creation as `default_pending` values in setup state, with a `confirmDefaultsFn`. Existing funds get them only when staff click "Apply defaults".
- Drive fill: `src/lib/fund-drive-prefill.server.ts`, staff-only server fn. It uses the linked Drive connection (read-only GETs) and extracts text from PDF/DOCX/Sheet (CSV export). Lovable AI (default model) does structured extraction to a fixed allow-listed schema, and regex redaction strips EIN/SSN/account numbers before the AI call and from results. Proposals are stored in `fund_setup_proposals` (append-only, source file id/name). Accept calls the existing canonical setters (e.g. `changeLegalName`).
- Verify end to end on the synthetic Walkthrough fund plus a browser check of both staff and fund-manager views. No real-fund writes during testing.
