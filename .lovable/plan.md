# Bring access and person records together

## What you'll get
- Every login that can open a fund or client is tied to one person record. Today 6 logins (7 access entries) have access but no person record: Jasmine Morgan, Brian Trueblood and Bonnie (Corps Cap Advisors), plus 3 test logins.
- Each person's page in People & Access gets an "Access" section listing every fund and client they can open, and why: fund manager, client member, fund team viewer, investor or staff role.
- From now on, giving someone fund manager, client member or fund team access makes sure they have a person record first, so no new gaps appear.

## What stays the same
- Nobody gains or loses access. The person record only describes who they are.
- Fund team lists still never give access on their own.
- People who share an ID but use different emails stay separate, as they are today.
- Identity checks, investor details and history are not changed.

## Steps
1. Create the missing person records for the 6 logins, using their login email and account name. Nothing is merged.
2. Add a safety step to every place that grants fund manager, client member or fund team access: it first ensures that login has a person record.
3. Add a read-only "Access" section to the person page, built from the shared fund check and the client team list. Each line has a link to where that access is managed.
4. Add a check that fails if any login with access has no person record. Compare everyone's access before and after, and expect no differences.

## Technical details
- Backfill: call the existing ensurePerson(userId, { email, legal_name }) for fund_managers and active client_users rows with no persons.user_id match. This is a data step, not a migration.
- Grant paths: fund-team-access, access-admin, invitations and the manager-add flows call ensurePerson before inserting into fund_managers, client_users or fund_team_grants. A database trigger on those tables fills any missed case by inserting a minimal persons row (same columns as ensurePerson) when none exists.
- Person page: a new server function personAccessSummary(userId) on ops.people_.$userId reads user_roles, memberFundIds and accessibleFunds, active client_users and investor_fund_access. It is staff-only, read-only and redacted to fund and client names plus the access source.
- Tests: a guard test for the trigger and grant paths, plus an access snapshot diff run before and after.
