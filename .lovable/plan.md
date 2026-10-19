# Calvin Jung invite check + personal investment links

## What the records show for Calvin Jung (CORPS Erebor)
- Dustin added Calvin as an investor on Oct 17, with an investment amount of $500,000 and the email calvinjungmd@gmail.com.
- **No invitation has been sent to him.** His investor record isn't connected to any invitation, there's no invitation for his email, and no Harmonious account for him exists yet.
- Edward Belsey, the other investor Dustin added, is in the same position: added, never invited.
- Erebor hasn't been launched yet. Until then, Dustin can send invitations from Investors → "Send onboarding".

## What we'll build: each investor's own personal investment link
That link opens the investor's own investment and starts with the deal review. It is tied to their email, so only that person can claim it after signing in. This is the same secure link the invitation email already uses, so no new kind of link is created.

**Fund manager, and Harmonious on the same fund view**
- On each investor's row and detail page there is a **Personal link** box showing the link with a **Copy** button.
- If the investor has never been invited, the box shows **Create personal link**. This creates the link without sending any email, so the manager can share it however they like. A separate **Send invite email** button remains for emailing it.
- It shows whether the link was sent, when it expires, and whether the investor has opened or claimed it.
- Regenerating or disabling a link stays limited to Harmonious staff, as it is today. Managers can view, copy and create a link for an investor who has none.

**Investor**
- Their dashboard and each investment page show **Your personal investment link** with a Copy button, so they can return to that exact investment later.
- They see only their own links.

## Rules kept
- Links open only for the invited email after sign-in. Bank details and readiness stay hidden as they are today.
- Every link created, sent or copied is recorded on the investor's history.
- Creating a link for an unlaunched fund is allowed, but a note says the fund opens to investors at launch.

## Technical details
- Reuse the existing invitation engine (`inviteInvestor`), adding a "no email" option that sets `investor_onboardings.invitation_id`.
- New manager/staff server functions to get or create the personal link, checked server-side against fund-manager or staff access. The investor function returns only invitations they have claimed.
- Add the box to `manager-fund-investors` / the investor detail page (shared fund workspace) and to the investor dashboard and investment page.
- Tests: no email is sent when creating a link; managers can't regenerate a link; an investor sees only their own links.
