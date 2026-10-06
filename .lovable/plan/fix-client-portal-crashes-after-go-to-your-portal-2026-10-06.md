# Fix: client portal crashes after "Go to your portal"

## What's happening
I signed in as a test client and opened the portal, and got the same "Something went wrong" page. The crash comes from the client side menu: it checks the client's list of shared funds before that list exists.

On the same page, two background requests come back "not allowed" (403). When that happens, the shared-funds answer arrives without its list, so the menu crashes and takes the whole page down with it. The cause of the 403s isn't confirmed yet. My best guess is a check that only lets Harmonious staff or signed-up users through.

## Fix
1. **Stop the crash.** Have the client menu treat a missing or failed shared-funds list as "no shared funds". Apply the same guard to the other lists the menu and the portal home page read: cap tables, the inbox unread count and workspaces. One failed request should then only hide a menu item, never break the page.
2. **Find and fix the 403s.** Re-open the portal as the test client, record which requests are refused and why, and fix whichever check is wrongly refusing a normal client. Server-side permission checks are not loosened: if a refusal is correct, the page will just hide that section.
3. **Check it works.** Sign in again as the test client, open "Go to your portal" from the home page header, and confirm the portal loads with its menu. Repeat for an investor test account.

## Technical details
- Crash: `src/components/client-sidebar.tsx`, `shared.data?.funds.length` throws when `listMySharedFunds` returns a body without `funds`. Change to `shared.data?.funds?.length ?? 0`, and use the same optional chaining on `caps.data`, `options` and the inbox hook.
- Trace the two 403 responses with Playwright request logging. Likely suspects: the `fund-team-access` / cap-table server functions, or SecurityGate step-up returning 403 for non-staff. Fix the function's authorization or its error shape so failures surface as query errors, not as partial data.
- Look for other places on the portal home page that read lists the same unsafe way (`data?.x.length`).
