# Build ROAS Hedge LP classes into the platform

## What exists today
- ROAS Hedge LP is set to multiple classes (4 planned).
- The four series are only in a **draft** economics version (v1), never approved:
  - Series A-1: $50,000 to under $100,000, 16% preferred return
  - Series A-2: $100,000 to under $200,000, 18% preferred return
  - Series A-3: $200,000 or more, 20% preferred return
  - Series B: $250,000 or more, no preferred return, PPM waterfall, one-year lock-up
- The fund's live class list (what investor records, agreements and reports read) is **empty**. That's why the classes don't show anywhere.

## What I'll build
1. **Live class records** for A-1, A-2, A-3 and B on ROAS Hedge LP, using the PPM ranges, preferred returns, lock-up and waterfall notes above. Fee and carry fields stay blank unless the PPM states them (I'll confirm from the uploaded PPM before writing).
2. **Approval gate:** the records go live only when the draft economics version is approved by a second person (or by you as Super Admin with a reason and authenticator code). Approving it creates the class records automatically, so the draft and the live list can't drift.
3. **Fees & terms page** shows each series with its range and terms, grouped by class name, with a "Pending approval" badge until approved.
4. **Investor records** show the assigned series once agreement prep records it from the signed amount (existing rule: $250,000+ needs staff or manager to pick A-3 or B).
5. Existing investors and signed documents are untouched.

## Checks
- Tests: approving the draft creates exactly 4 classes with the stated ranges; $75K resolves to A-1, $150K to A-2, $220K to A-3, $300K requires a choice.
- Read back the class list on the ROAS Fees & terms page after approval.

## Technical details
- Add a server path that, on `fund_economics_versions` approval, upserts `investor_classes` (code = series key, `series_label`, `preferred_return_bps`, `terms` jsonb with min/max cents, appliesTo, lockup) for the offering, versioned and effective-dated; reuses existing maker-checker approval.
- No direct SQL insert of live classes bypassing approval.
