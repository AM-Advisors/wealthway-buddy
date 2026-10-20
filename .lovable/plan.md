# Auto-connect investors with the same tax ID and name once verified

## Rule
Two investor records connect automatically, with no Harmonious review, when all three are true:
1. **Same tax ID.** They have the same protected tax-ID match code. The number itself is never compared or shown.
2. **Same name.** For individuals, the legal first and last name match. For businesses and trusts, the legal entity name matches. Case, punctuation, extra spaces and endings such as "LLC" vs "L.L.C." or "Jr" vs "Jr." are ignored.
3. **Verification passed on both.**
   - Individuals: KYC and AML are both clear.
   - Businesses and trusts: KYB is approved and the business AML check is clear.

If any of the three is missing, today's behavior stays: "Same tax ID as an existing investor" goes to Harmonious to confirm.

## What "connect" does
- **The two person records become one.** The older record, or the one with a sign-in account, is kept, and the other becomes read-only and linked to it, using the existing merge with history.
- **The investing profiles and investments move onto the kept record.** That account then sees all of them, and so do the fund managers of each fund.
- **Two accounts:** if both records already have different sign-in accounts, nothing merges automatically. It goes to Harmonious, because that would combine two logins.
- **History:** each automatic connection is recorded with the reason "Same tax ID, name and verified" and shows in History.

## When it runs
- When a tax ID is saved.
- When a KYC or KYB check comes back clear. This catches records that were already matched but not yet verified.
- In the daily connection check, which also covers the existing records. There is one pair with the same tax ID today, and it connects only if it meets all three conditions.

## Never changes
- No deleting.
- Verification results, signatures and money aren't affected.
- A tax ID alone, or a name alone, never connects anything.

## Technical details
- `account-connect-model.ts`: add `normalizeLegalName` and extend `decideTinMatch` with `nameMatches` and `verifiedBoth` inputs. When both are true, return `merge` (with keep/drop chosen by account ownership, then age), unless both have different `user_id`s, which returns `review`.
- `account-connect.server.ts` `recognizeTin`: load person KYC/AML, or the entity's `kyb_status` and `entity_aml_status`, for each side. On `merge`, call the `merge_persons` RPC with `_rule: 'same_tin_name_verified'`, then `connectAccount` for the kept user.
- Hook into the KYC/KYB clear paths (Didit webhook and in-platform review decision) to re-run `recognizeTin` for that person's profiles, plus the daily `sweepUnconnected` pass.
- Tests: all three conditions merge; a mismatched name, unverified side or different accounts each go to review; name normalization cases.
- Save this rule to project memory.
