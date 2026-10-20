# Confirm Operations → Funds loads for a real staff member

## Steps
1. **Sign the preview in as a staff member.** I'll list the five Harmonious staff accounts and ask you which one to use. A one-time sign-in for that person then needs your approval on an approval card.
2. **Get past the authenticator step.** Last time the test sign-in stopped there. I'll try in this order:
   - use the session the approval creates, if it already counts as authenticator-verified
   - otherwise, run the same server request the Funds page makes, as that staff member, and time it
   - otherwise, ask you or the staff member to open the page and send me a screenshot
3. **Confirm the summary.** Open Operations → Funds and check:
   - the page loads without "couldn't load" or "access is required"
   - it shows all 31 funds
   - the investor counts add up to the 241 active investors
   - how long it takes to load

   I'll take a screenshot and check the investor total against the database.
4. **Report back** with the screenshot, the load time and any fund where the count doesn't match. If something is off, I'll explain the cause before changing anything.

## What won't change
- No access, investor or fund records are changed. This is read-only.
- I won't turn off or work around the authenticator requirement.

## Technical details
- Session: `lovable auth-session --json --user <uuid>` for the chosen staff account, restored into Playwright.
- If the MFA step blocks the browser, the fallback is the dashboard server function, invoked with that user's identity.
- The count check uses `count(*)` of active onboardings against the sum of the per-fund investor counts and the onboarding_readiness_summaries rows.
