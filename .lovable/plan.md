# K-1s from banking and investors, bank statement upload, and an asset/NAV module

## What you asked for vs. the safety rule
Your standing rule says nothing is ever filed automatically. So the K-1 work below **prepares the K-1s for you automatically**: every number is filled in from bank activity and investor records, and the draft goes into the fund's tax records. Filing and delivery stay a human step for Harmonious, as they do today. If you want real e-filing, that's a separate decision. It needs the rule changed and IRS e-file credentials.

## 1. Upload bank statements, read them and apply them (Banking tab)
- Fund managers and Harmonious upload a bank statement (PDF or CSV, up to 20 MB) on the fund's Banking tab.
- The platform reads it with AI and pulls out each transaction: date, description, amount, money in or out, and the statement's opening and closing balance.
- A review screen shows each line with a suggested meaning: investor contribution (matched to the investor), distribution, management fee, fund expense, asset purchase or sale, income (interest or dividends), or other.
- The manager confirms or changes each line, then presses **Apply**. Confirmed lines become fund transactions and bookkeeping entries, using the same records as the Plaid connection.
- Duplicate protection: lines already brought in from Plaid or an earlier statement are flagged and skipped.
- The balance check must tie: opening balance plus activity must equal the closing balance before you can apply. If it doesn't, the screen shows the gap.
- Nothing moves money. This only records what already happened.

## 2. K-1s filled in from banking and investors (Accounting, K-1 report)
- Year totals fill themselves in from the applied bank activity and bookkeeping entries for the tax year:
  - interest goes to box 5, dividends to 6a, and gains to 8, 9a or 10
  - fees and expenses go to 13
  - distributions per investor go to box 19
- Each investor's share comes from the money they actually wired in that year, taken from the matched contributions and their onboarding record.
- Each K-1 line carries the investor's name, investing entity, address and the last four digits of their tax ID from their investment profile. The full tax ID stays encrypted.
- The client can still change any total before building. The approval step stays the same: a second Harmonious person approves, then draft K-1s go into the tax records.
- A ready-to-check list shows anything missing per investor, such as no tax form on file, no address, or not signed in yet.

## 3. Assets, valuations and NAV module, so the charts fill in (Assets tab)
- **Add asset:** managers and Harmonious can add a portfolio asset with name, type, instrument, purchase date and cost. A confirmed "asset purchase" bank line can create one in one click.
- **Record valuation:** enter a value as of a date, with the method and an optional supporting document. Managers' values show as "Manager mark" until Harmonious approves them.
- The Assets charts (cost vs. latest value, and allocation by type) read these records, so they show real numbers as soon as one asset exists.
- **NAV from the books:** a Build NAV button pre-fills the NAV report from cash (bank balance), approved asset values and recorded liabilities. It uses the existing approval flow and feeds the Accounting NAV chart.
- **Financial statements:** for an approved period, the platform builds a simple balance sheet, income statement and changes-in-capital summary from the same entries, as a draft package for Harmonious review. That uses the existing statement review, and nothing reaches investors until it's approved.

## What isn't included
- No automatic filing or delivery of K-1s, and no bank debits or money movement.
- AI reading is a suggestion. Every line is confirmed by a person before it's applied.

## Technical details
- New table `bank_statement_uploads` (file path, parsed JSON, status uploaded/parsed/applied, opening/closing balances, uploaded_by) and `bank_statement_lines` (upload_id, date, amount_cents, direction, description, suggested_category, confirmed_category, matched_onboarding_id, duplicate_of, applied_tx_id). Server-only access with GRANTs and RLS.
- Parsing in a server function through the Lovable AI Gateway (Gemini, file input). Output goes through a Zod schema, and the balance tie is checked server-side.
- Apply writes `bank_transactions` (source 'statement') + `fund_transaction_tags` + `fund_ledger_entries` in one server pass. Dedupe is on (date, amount, normalized description).
- `deriveK1Totals(entries, year)` and `investorBasis(contributions)` are pure functions in `k1-report-model.ts`, with unit tests. The K-1 form gets a "Fill from books" call. Profile details come only through existing investment-profile reads (last 4 only).
- Assets: create/value server functions on `portfolio_assets` / `asset_valuations`, gated by `assertFund`. Manager marks have status pending, and only staff approve. `computeNavFromBooks` pre-fills the existing NAV draft inputs.
- The statement draft writes a `financial_statement_packages` draft via the existing package service.
- AGENTS.md rules are added for statement ingestion (confirm-before-apply, no money movement) and books-derived K-1s (still maker-checker, never filed).
