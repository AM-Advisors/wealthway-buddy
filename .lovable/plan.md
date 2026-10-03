# Harmonious fund workspace: the same tabs as the client, with processing tools

## What changes

The Operations fund setup page (Operations → Funds & SPVs → a fund) becomes a tabbed workspace. It has the same tabs fund managers see, plus a Setup tab. Each tab shows exactly what the client sees, and adds Harmonious-only controls to process the work there, instead of jumping to separate queues.

| Tab | What Harmonious can do there |
|---|---|
| **Setup** (first tab) | Everything on today's page: entity formation and launch checklist, Fund Setup sections, EIN and SS-4, tax documents, sign-off queue. |
| **To dos** | See every "waiting on you / waiting on Harmonious" item. Mark Harmonious items done; accept or return what the manager answered, with a note. |
| **Fund Details** | Edit fund details and fees. Record or verify the EIN, which is shown in full for staff. |
| **Team** | Add or remove team members and change their permissions. Confirm GP and signatory roles. |
| **Investors** | The full investor grid and popout. Review KYC, documents and wiring, send reminders, create or turn off the invite link, open investor review. |
| **Documents** | Upload, approve or archive documents, and set signature blocks. |
| **Banking** | Verify and save wire instructions, confirm wire/ACH payments received (existing receipt flow), apply bank statements, tag transactions. |
| **Accounting** | Build reports without payment. Approve or return NAV, financial review and K-1 reports (a different person from the preparer). Save statement drafts and review statement packages. |
| **Assets** | Add assets, record values that take effect straight away, and approve or return manager marks. |
| **Closes** | See close requests, approve or return them, and prepare and record Form D / state filings (existing filing workflow). |
| **Regulatory** | Edit the filing calendar and state fees, and record filing confirmations. |

**Also:**
- **Header:** client name, fund type, progress, next deadline, a "View as fund manager" button, and the **Payments** and **Migration** links that already exist.
- **Ask Harmonious buttons are hidden** in this view, because staff don't pay themselves.
- **Who can process:** the same rules as today. Operations staff can process, and other staff can view. Approvals still need a second person wherever they do today. Nothing is filed, paid or moved automatically beyond what's already allowed.

## Not included

- No new approval rules or permissions; this reuses the existing server checks.
- No change to the client's own fund page.

## Technical details

- **Shared fund page:** extract the body of `src/routes/_authenticated/client.funds.$fundId.tsx` into `src/components/fund-workspace.tsx` (`FundWorkspace({ fundId, mode: "client" | "harmonious", extraTabs })`). The client route becomes a thin wrapper, so the two views can't drift apart.
- **Ops page:** `ops.fund-setup.$fundId.tsx` renders `FundWorkspace mode="harmonious"`, with a `setup` tab holding today's content. Its `?tab=` search param uses the same tab list plus `setup`.
- **Mode handling inside the tabs:**
  - Hide `RequestHarmoniousButton` and payment summaries.
  - TodosTab shows staff accept/return actions through the existing `updateSetupTaskFn`.
  - EinField: staff reveal plus record/verify via the existing EIN functions.
  - Banking: embed `QuickWireConfirm` / `PendingWireVerifications` and `FundPayments`, filtered to this fund.
  - Closes: embed the existing close-request review and filing panel from `ops.close-requests` for this fund.
  - Investors: add a link to investor review.
- **Access:** load functions already allow staff (`canViewFund`, `assertFund` staff path, and `getClientFund` STAFF_ROLES). Verify each tab's functions in the Harmonious view, and widen only read checks that wrongly reject staff. Process actions keep their current server-side role and maker-checker checks.
- **Verification:** load the page as a staff session in preview and click through every tab on the walkthrough fund. Confirm the client page renders unchanged.
