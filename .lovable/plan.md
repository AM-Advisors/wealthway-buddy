# MSA and SOW: no renewal date means ongoing, renewing every year

## Rule
If an MSA or SOW has no end or renewal date, and the contract doesn't say it won't renew, treat it as an ongoing (non-terminating) contract. It renews automatically every year on the anniversary of its effective date. It is never shown as expired, ending, or "Unable to calculate".

If a contract states its own end date, renewal terms, or that it doesn't renew, those terms always win. Signed and stored documents are not changed; this only affects how dates are shown and tracked.

## Where it shows

1. **Contract details (Contract family).** Instead of "Unable to calculate: review required", an MSA or SOW with no dates shows:
   - Automatic renewal: Yes (annual)
   - Renewal date: the next anniversary of its effective date
   - Term: "Ongoing, renews annually"
   The status uses the normal renewal and notice windows.
2. **Account Management Renewals.** SOWs with no end date appear when their next anniversary is within 90 days, labeled "Annual renewal". Today they never appear.
3. **SOW lists (staff SOW editor, client dashboard).** Where an end date would show "ends {date}", an SOW without one shows "Ongoing · renews annually on {month day}".
4. **Client dashboard upcoming dates.** These include the next annual renewal for SOWs with no end date.

Other contract types (side letters, amendments and so on) keep today's behavior.

## Technical details
- Add `src/lib/contract-renewal-default.ts` with:
  - `appliesEvergreenDefault(docType, { endDate, autoRenews })`: true for `msa`/`sow` when there's no end date and auto-renewal isn't explicitly false.
  - `nextAnniversary(effectiveDate, today)`.
- In `computeLifecycle` (`contract-intelligence.ts`), for `msa`/`sow` with no `initialTermEnd` and `autoRenews !== false`:
  - set `autoRenews = true` and the renewal period to 12 months
  - set `renewalDate` to the next anniversary, and `currentTermEnd` to the day before it
  - add an `evergreenDefault: true` flag so the UI can label the term "Ongoing, renews annually"
  - don't push "initial term end" or renewal items to `unable`
  Explicit terms are untouched.
- `account-management.server.ts` renewals: add SOWs with null `termination_date` whose effective-date anniversary falls within 90 days.
- `sow-editor.tsx` and `client-dashboard.tsx` show the ongoing label and include the anniversary in upcoming dates.
- Tests:
  - an SOW with no dates renews on the anniversary
  - an explicit "does not renew" stays expiring
  - an explicit end date wins
  - a side letter with no dates is unchanged
- Save this rule to project memory.
