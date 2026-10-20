# Fix Calvin's "This account isn't on the fund's list yet" screen

## What happened
- Calvin created his account at 4:58 Denver this morning from yesterday's reminder email. At that time he had no invitation, so the portal showed the hold screen. His screenshot (sent 5:05) is from then.
- His real invitation was sent at 9:13. It is still waiting, and his investment is not yet connected to his account.
- The risk now: if Calvin simply signs in again, the portal accepts his invitation but does not connect him to the investment Dustin created. His personal link would then report that it has already been used. He would get stuck again.

## Fix
1. **Signing in connects the investment.** When someone signs in and has a waiting investor invitation tied to an investment (like Calvin's), the portal uses the same connection step as the personal link. It connects them to that exact investment and opens it. It no longer just marks the invitation as accepted.
2. **The personal link still works afterwards.** If the invitation was already accepted by the same person, the link opens their investment instead of saying it was used.
3. **A clearer hold screen.** It gets a "Check again" button, so a new invitation is picked up without signing out. A loading failure shows "We couldn't check your access, try again", not "not on the list".
4. **Calvin.** No data change is needed. Once this is live, signing in or opening his invitation link takes him straight into CORPS Erebor. I'll confirm his record is connected after he does.

## Check on Alyssa (test account for this fund)
- Your staff account skips the investor hold screen. So the check uses your CORPS Erebor test investor record: add your email to it and create a personal link. Then run the sign-in connection as you and confirm it opens that investment, and that the link still opens the same investment afterwards. No email is sent.
- Add automatic tests for: sign-in connects the investment tied to the invitation; a second claim by the same person reopens it; a different person is still refused.

## Not changing
- Invitations stay tied to the invited email. No access is widened, and money, signing or verification are unaffected.

## Technical details
- `getPortalAccess` (portal-access.functions.ts): for pending investor invitations with an `investor_onboardings.invitation_id` match, call `claimOnboardInvitation(userId, token)` (it requires a verified email and the matching recipient) instead of the generic access upsert. Return `openOnboardingId` so `PortalGate` navigates to `/onboard/i/$id`.
- `claimOnboardInvitation`: when the invitation is `accepted` with `accepted_by = userId`, return the bound onboarding instead of failing.
- `PortalGate`: separate the `isError` state, add a refetch button, and drop the 60-second stale cache for the hold state.
