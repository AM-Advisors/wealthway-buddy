# Fund Setup: Master LLC wording and series naming

## What changes

In the "Launch a new fund or SPV" wizard (client portal), when the Vehicle / entity structure is **Series LLC**:

1. **Rename the dropdown label** from "Series LLC home" to **"Master LLC"**. The choices stay the same (HCAM TX, HCAM WY, AM SPV Fund Management, Bring my own, Set up new), and each Harmonious master still fixes the jurisdiction as it does today.

2. **Automatic legal name**: when a Harmonious master is chosen (HCAM TX, HCAM WY, or AM SPV Fund Management), the fund's legal name is set automatically to:

   ```text
   {Fund name}, a series of {Master LLC name}
   ```

   Example: "Acme Ventures I, a series of HCAM TX".

   - The legal name updates live as the client types the fund name or changes the master.
   - The legal name field shows the generated value and stays editable if the client needs to adjust it.
   - "Bring my own" and "Set up new" are unchanged - the client enters the master/entity name themselves as today.

3. **Carried through everywhere the request is shown**: the generated legal name flows into the request summary, the Operations review, and the SS-4 pre-fill (line 1 legal name), exactly as the legal name does today.

## Technical details

- `src/lib/fund-request-model.ts`: rename the "Series LLC home" label strings to "Master LLC"; add a helper `seriesLegalName(request)` that builds `{fund_name}, a series of {master label}` for Harmonious masters.
- `src/routes/_authenticated/client.funds.new.tsx`: when a Harmonious master is selected, auto-fill `legal_name` from the helper (keeping it in sync with fund name and master changes) and show a hint that it was generated.
- `src/lib/fund-request-model.test.ts` / `fund-request-extras` tests: update label expectations and add tests for the generated legal name (including master switch and fund-name edits).
- No database changes; no change to jurisdiction mapping, SS-4 rules, or the $2,000 "Set up new" fee logic.
