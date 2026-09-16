# Fund-first management workspace

Use the uploaded Fund Management design as the structural guide while keeping Harmonious’s current white, navy, teal, Rubik, and Poppins identity.

## 1. Portfolio home

Refocus **My funds** as the manager’s portfolio dashboard:

- Compact totals for active funds, committed capital, received capital, pending approvals, and open exceptions.
- Searchable, sortable fund table with fund status, strategy/type, investor count, commitments, received funds, setup readiness, and next required action.
- Keep invitation, alert, and urgent queue actions available without the current long directory of tool cards.
- Opening a row establishes the selected fund and enters its dedicated workspace.

## 2. Dedicated workspace for each fund

Build the fund detail around a persistent fund header and section navigation inspired by the design:

- **Overview** — fund profile, legal entity, offering status, target, commitments, cash received, setup readiness, active SOW/scope, providers, and recent activity.
- **Investors** — investor roster with KYC/AML, accreditation, documents, funding, commitment, and approval status; search, filters, and existing investor review actions.
- **Assets & performance** — portfolio value, valuations, cash flow, performance, ownership, and capital-account reporting using the existing boards.
- **Transactions** — incoming wires, payment matching, closings, distributions, bank connection, and exceptions using the existing controls and dual approvals.
- **Documents** — fund documents, signed copies, diligence materials, offering memo/terms, tax documents, permissions, and Box filing status.
- **Compliance** — fund checklist, investor KYC/AML and accreditation evidence, holds, exceptions, and audit history.
- **Settings** — fund/entity details, public page, access, roles and permissions, alerts, and assigned team.

The selected fund stays visible while moving between sections, so users do not repeatedly choose it.

## 3. Roles and permissions

- Preserve the current assignment model: fund managers see only assigned funds; authorized Harmonious staff retain broader access.
- Reuse existing authority checks for approvals, money movement, document access, and configuration.
- Add a clear roles-and-permissions view within each fund, modeled on the uploaded design, without weakening existing server-side protections.

## 4. Navigation and route organization

- Expand the existing **Fund management** sidebar group into a concise portfolio entry plus selected-fund sections.
- Add fund-specific addresses under `/manager/fund/{fund}/...` for the major sections.
- Preserve existing manager addresses with redirects or compatibility links so saved links continue to work.
- Keep the sidebar collapsible, searchable, permission-aware, and usable on phone and desktop.

## 5. Reuse, not rebuild

Connect the new structure to the existing investor review, documents, diligence, banking, wires, closings, performance, cap table, tax, compliance, access, and audit functions. Move or wrap existing screens rather than duplicating their data or business rules.

## 6. Visual treatment

- Retain the Harmonious light brand rather than copying the reference’s black and pink palette.
- Adopt the reference’s compact tables, strong section labels, restrained status chips, clear action bars, dense fund summaries, and consistent field layouts.
- Use full-width work areas for operational tables, with responsive stacked summaries on smaller screens.

## Delivery order

1. Portfolio home and shared fund workspace shell.
2. Overview, Investors, and Transactions.
3. Documents, Assets & performance, and Compliance.
4. Settings, team permissions, legacy-link compatibility, and final responsive/access review.

## Verification

- Verify assigned-manager, administrator, and read-only variants.
- Verify every fund section keeps the correct selected fund and existing scope gates.
- Verify investor evidence and money controls remain protected.
- Check desktop, collapsed-sidebar, and phone layouts.
- Confirm all routes build and the existing manager links remain usable.
