# One source for access, verification and activity

## Short answer
Yes, everything is already in one database. The overlap comes from having several separate lists inside it for the same thing. This plan makes each area have one list that decides, with older lists either retired or kept only as history. Nothing is deleted and nobody's access or verification result changes.

## What is overlapping today

| Area | Lists today | Problem |
|---|---|---|
| Staff access | Staff roles (79), plus 5 newer lists (3 entries total) | Two systems for the same staff roles |
| Staff assigned to clients | Two lists (2 and 23 entries) | Same assignment kept twice |
| Fund access | Fund managers (23), fund team (48), fund log-in levels (0) | People on the team without matching access, and the reverse. About 125 screens check access their own way |
| Identity checks | Account check (45), older per-investment checks (19), provider results (57), check requests (18) | Some investors have two checks; screens can read the wrong one |
| Accreditation | Two lists (10 and 15) | Same answer can be saved twice |
| Activity history | About 133 separate history lists | No single place to see what someone did or what happened to them |

## What I'll do

### 1. Access: one list per question
- **Staff:** Staff roles stays the only list that decides. The 3 entries in the newer lists are matched to staff roles, then those lists stop taking new entries.
- **Client staff:** one assignment list. The 2 entries in the older list are copied over, then it is retired.
- **Fund access:** the fund team list says who is on the fund; fund access is granted separately (your decision: being on the team list never gives access by itself).
- **Every fund screen** moves to the one shared fund check, in batches, with all accounts tested before and after each batch.
- The database's own rules use the same shared check as the app.

### 2. Verification: one result per person
- The account ID check is the only result that counts for a person, for every investment.
- Older per-investment checks are kept as history only. New ones can no longer be created.
- Provider results and check requests attach to that one check.
- Accreditation: one list per investing party; the second list becomes history only.
- Companies and trusts: one shared reader for business checks and screening.
- Every screen reads verification through one shared reader.

### 3. Activity: one timeline
- Existing history stays exactly where it is and stays locked (it is evidence).
- One combined, read-only timeline joins them: sign-ins, access changes, role changes, team changes, verification, signatures, fund and contract changes.
- View account and People & Access show that one timeline, filterable by person, fund and type.
- New activity is recorded through one shared helper so it always lands in the timeline.

## Not changing
- Money, tax, identity and Super Admin approvals keep their own separate approvers.
- No history is rewritten or deleted.
- Nobody gains or loses access. I compare every account's access before and after.
- No emails are sent.

## Order
1. Before snapshot of every account's access and verification.
2. Access lists (staff, client staff, fund).
3. Verification.
4. Activity timeline.
5. Fund screens moved over in batches.
6. After snapshot compared with the before snapshot; any difference is reported, not silently kept.

## Technical details
- Canonical sources: `user_roles`; `client_team_assignments`; `fund_team_members` + `fund_managers` synced by trigger/service; `account_identity_checks`; one accreditation table (chosen after column review); `entity_verifications` + `aml_screenings` behind one reader.
- Retired tables get `COMMENT ... 'DEPRECATED: replaced by ...'` and write-blocking triggers; no DROP.
- Shared readers: `fund-access.server.ts` (exists), new `person-verification.server.ts`, `accreditation-reader.server.ts`.
- Timeline: `activity_timeline` read-only view (security invoker) unioning the event tables, with staff-only and own-record RLS; `recordActivity()` helper for new writes.
- DB: one `can_access_fund(_uid, _fund, _level)` function used by RLS, matching `allowsFundLevel`.
- Tests: guard tests fail if a screen reads a retired list or writes its own access check; before/after access snapshot diff.
