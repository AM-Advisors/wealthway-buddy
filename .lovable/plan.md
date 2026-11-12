# Fix the five record issues and review for other mismatches

## 1. Fix the five items you approved
1. **Erebor "Alyssa Test" ($10,000,000):** remove it the normal way, with "test record" as the reason. It's kept in history, not deleted. Erebor's total then shows the real $2.1M.
2. **ROAS Hedge LP:** record "Launch confirmed" with you as the approver, set the fund to launched and open, and keep its existing onboarding link. Nothing about investors, signatures or money changes.
3. **Funds that already have investors but show low setup:** where a fund has closed or funded investors, show "Already operating · setup items to tidy" in place of a misleading percentage. The open setup items stay visible. Funds with no investors keep the percentage. Eradivir, Founders Fund and the 4D funds aren't marked as moved-in funds today; they'll be marked as moved-in only where investors are already funded or closed.
4. **99 investors marked "received" with $0 (4D funds, Founders Fund):** add a staff-only list on the Operations funds page called "Received, amount not recorded". From there, staff enter the amount through the existing funding review. No money is moved and nothing is posted automatically.
5. **Kimberly's Erebor investment ("J Girardi"):** submit a name correction to J GIRARDI K GIRARDI REV TRUST through the normal investor correction review. The original details stay as retained history.

## 2. Look for other mismatches like this
Compare, fund by fund, the numbers each screen shows for the same thing:
- investor counts, ready counts and funded counts: Operations funds page, manager fund workspace, fund readiness list, Investor 360
- committed and funded totals: the older cap table and funding dashboard (built from older application records) vs. the current cap table
- the investor's capital page: an older application record in a fund can hide that investor's current investments in the same fund
- the manager's fallback setup checklist vs. the main setup percentage
- test or demo funds counted on one dashboard but not another
- "no open to-dos" while setup is under 100%
- ready status saved for the dashboard that has fallen behind the investor's actual progress

Each mismatch found gets either:
- the same fix approach as the earlier amount fix, or
- a listed record issue for you to decide on, if fixing it would change records.

## 3. Check and report
- Automatic checks for each rule.
- Signed in as staff, compare Erebor, ROAS and one 4D fund across the screens above.
- A short report: what matched, what was fixed, and what's waiting on you.

## Technical details
- Record changes go through the existing removal, launch (approved launch plus the existing launch-link check), investor-record correction and funding review paths. No direct database edits.
- The display rule lives in one shared place and covers dashboards and workspaces.
- "Received, amount not recorded" only reads data and only staff can see it.
- The older application paths reuse `investmentAmountCents` and `isLiveInvestment`. The investor capital filter becomes exact per investment instead of per fund.
- Not published.
