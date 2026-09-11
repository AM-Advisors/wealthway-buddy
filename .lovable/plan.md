# Capital account statements at closing

Each investor gets a capital account statement when their closing is confirmed, and staff
can generate statements for every closed investor in one go when the fund closes. Statements
appear in the investor's portal alongside their other closing documents — no email is sent.

## What the statement shows

- Investor name and how they hold their interest, fund name and legal entity
- Closing date and statement date
- Commitment amount
- Capital contributed (settled payments)
- Any amount still outstanding against the commitment
- Ownership percentage and units/shares held, from the fund's cap table
- Distributions paid to date, if any are recorded
- Latest recorded fund value and the investor's share of it, if a valuation exists
- Harmonious footer wording: recordkeeping and administration only, not a valuation,
  audit, tax or investment advice

## Where it appears

- Investor portal: on the closing/documents view, listed as "Capital account statement"
  with view, print and download. Same self-contained document approach already used for invoices.
- Staff closing board: a "Statements" column showing whether each closed investor has a
  current statement, a per-investor regenerate action, and a "Generate for all closed
  investors" button at the fund level.

## Rules

- Only closed investors get a statement; withdrawn, declined or unfunded ones are skipped.
- Regenerating supersedes the previous statement rather than deleting it, so the trail keeps
  every version with the date and who produced it.
- Generation is gated on the client's active scope for capital-account statements. If the
  service is not in scope, staff see the standard message: "This service is not currently
  included in your active scope. Request service." and the button is disabled.
- Every generation is written to the audit trail (who, when, which investors, which fund).

## Technical notes

- New table `capital_account_statements`: offering_id, application_id, closing_id, statement
  date, period end, snapshot JSON of every figure shown, version number, superseded flag,
  generated_by, generated_at. Grants for authenticated and service_role, RLS so investors
  read their own rows and fund managers/admins read and write for their funds.
- `src/lib/capital-statements.functions.ts` — `generateStatementForApplication`,
  `generateStatementsForFund`, `listFundStatements`, `getMyStatements`. Figures are read
  server-side from `application_closings`, `investor_applications`, settled `payments`,
  `investor_cap_positions`, `fund_distributions`, `fund_valuations` and stored as a snapshot
  so the document never changes retroactively.
- `confirmClosing` in `src/lib/closing.functions.ts` calls the generator after the closing
  row is stamped, non-blocking — a statement failure must not roll back a closing.
- `src/components/capital-statement-document.ts` renders branded printable HTML using
  `@/lib/company-details`, mirroring `invoice-document.ts`.
- Scope check uses the existing `capital_account_statements` service key already present in
  the service catalog and `src/lib/fund-scope.ts` reporting mapping.
