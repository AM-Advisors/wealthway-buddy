# Fix Publishing & performance loading, and turn on live Facebook and Instagram

## What I found
- **The page itself works.** The page address answers normally, and the data behind it loads in about 2.5 seconds with no errors. That includes your posts' Facebook and Instagram numbers, for example Instagram reach 3. The live site's logs from the last hour show no failures on this page.
- **What I couldn't confirm.** I couldn't see your exact screen, because the preview stops at the authenticator step. So the reason it looked like it "didn't load" isn't confirmed yet.
- **Most likely cause.** The page loads everything in one go, including a call to Google Search Console. While that call is slow, the whole page shows only "Loading…", and if it fails the page shows nothing useful.
- **Publishing is in test mode.** No one has asked for live publishing yet. Live publishing needs one person to ask and a second person to approve. As a Super Admin, you can approve your own request with a reason, and that reason is kept permanently.

## Changes
1. **Show each part on its own:** the Queue & log, Social performance and Weekly sections stop waiting on Google Search Console.
   - Search & website loads separately, with its own "Not available" message if Google is slow or fails.
   - Any loading problem shows a clear message and a **Try again** button, instead of a blank page or a page stuck on "Loading…".
2. **Turn on live publishing for Facebook and Instagram:**
   - Record the request in your name ("Alyssa requested live Facebook and Instagram publishing"), then approve it as a Super Admin with the logged reason "Approved by Alyssa Pettit (Super Admin) on request".
   - The banner will then say "LIVE publishing is on". Approved, scheduled posts will publish publicly to the Page and Instagram, and the "Return to test mode" button stays available.
3. **Check it:** reload the page data as you, confirm every section comes back, and confirm the mode reads live.

## Note
Turning on live means any post that's already approved and due will go public on the next publishing run, within about 5 minutes. Right now, nothing is waiting in the queue to be published.

## Technical details
- **Separate loading for search data:** split `dashboard()` in `src/lib/marketing-perf.server.ts`. Move `searchProperties()` and the search rows into a new `getSearchPerformance` server function, with a 8s timeout through AbortController. `getPerformance` then returns only queue, attempts, perf and recommendations.
- **Page changes:** in `src/routes/_authenticated/marketing_.performance.tsx`, add a separate query for the Search tab, error states with retry, and `retry: 1`.
- **Turning on live:** call the existing `requestLive` / `approveLive` code paths for user fcf83359 (super_admin), using the existing self-approval rule, which prefixes the reason "[Super Admin self-approval]". No change to the approval rules.
