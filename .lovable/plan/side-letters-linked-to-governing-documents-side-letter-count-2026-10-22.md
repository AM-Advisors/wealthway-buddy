# Side letters linked to governing documents + side-letter count in close pricing

## What changes for you

1. **Side letters reference the fund's Operating Agreement and Subscription Agreement.**
   When Harmonious generates a side letter, it will name the exact Operating Agreement and Subscription Agreement it modifies (document title, version and effective/signed date), and each selected item will state the original term it changes (for example "Management fee: 6% of committed capital under the Operating Agreement, v2" → the agreed exception). The investor's own Subscription Agreement (amount and date) is cited when one exists.
   - If either agreement is missing, unsigned, or its terms can't be read, generation stops and lists what's missing — nothing is guessed.
   - Already-generated or signed side letters stay exactly as they are.

2. **Close requests count side letters and price them.**
   The Request Close form gets a "Side letters" line under fees: the number of side letters for the investors selected in this close and the total at the existing $1,500 per side letter (e.g. "3 side letters × $1,500 = $4,500"). It's shown as an estimate Harmonious confirms, like the other close fees, and is saved with the request so Operations sees it on the close review screen.
   - Side letters already paid for through the existing side-letter checkout show as "already paid" and aren't charged twice.
   - Nothing is charged automatically.

## Technical details

- `src/lib/fund-doc-templates.ts`: `sl_combined` render accepts a `governingDocs` context (OA/subscription title, version, date, current term per item) and adds a "Governing documents" recital plus "replaces/supplements Section …" wording per clause; legacy keys still render.
- `src/lib/fund-doc-templates.server.ts`: staff-only generation path loads the fund's active OA and Subscription Agreement versions and active fee terms (existing canonical readers), plus the investor's subscription record; refuses with a clear list when missing.
- New pure helper `src/lib/close-side-letter-pricing.ts`: count side letters (approved/proposed records in side-letter registry + generated sl_* drafts) for selected onboardings, subtract paid side-letter fees, multiply by `SIDE_LETTER_FEE_CENTS`.
- `fund-close-requests.functions.ts`: authorized read returns per-investor side-letter counts; submit stores `sideLetterCount`, `sideLetterFeeCents`, `sideLetterPaidCount` in details (server recomputes, ignores client totals).
- `request-close-dialog.tsx` and `ops.close-requests.tsx`: display the line.
- Tests: governing-doc references rendered, missing-agreement refusal, count/paid-subtraction/total math.
- Record rule in `src/lib/AGENTS.md`; update close-request-fees memory.
