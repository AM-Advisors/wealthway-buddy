# Quote foundation and bookkeeping services without setup details

## What changes
Sales picks services and prices only. The foundation, fund or bookkeeping details are filled in on the platform after the client signs and pays, during the onboarding call.

1. **Proposals page:** ticking a Foundation service adds it as a plain line priced from the rate card, and no setup box opens. Bookkeeping goes back on the checklist the same way.
2. **Quote editor:** foundation and bookkeeping lines can also be added straight from the rate card list. The "Configure Foundation Administration" and bookkeeping setup boxes stay available for anyone who wants them, but neither is required. The "Set up foundation details" button on a line becomes optional.
3. **The error goes away:** saving no longer shows "missing its foundation details". The line is labeled "Details collected at onboarding" on the quote and the proposal.
4. **After signing and payment:** a to-do is created for the onboarding call to fill in that client's foundation or bookkeeping details, using the existing setup screens. Nothing is set up automatically.

## Rules that stay the same
- Prices come from the rate card. Any line priced below the rate card still needs CEO or CRO approval.
- Foundation Administration quotes still can't be sent, signed or billed until that service is released. Drafting and internal approval work as they do today.
- Signed quotes and agreements keep their history unchanged.

## Technical details
- `saveQuote` in `sales-quotes.server.ts`: accept a foundation or bookkeeping service key without a `foundation` or `bookkeeping` payload. Price it from the rate card or approved foundation rate, flag it `details_pending: true` in the line's details, and skip `verifyFoundationQuoteLine` and the coverage checks for that line. Lines that do carry details keep today's verification.
- Proposal `ServicePicker` (`sales_.documents.tsx`): remove the configurator trigger and the bookkeeping filter, and add lines as plain rate-card lines.
- Quote editor `add()` (`sales_.quotes.tsx`): rate-card picks add plain lines; the configurator stays behind its button.
- Signing/payment hook: on acceptance, create a quote-keyed staff task per pending line ("Collect foundation details at onboarding"), using the existing staff task engine and no new queue.
- Tests: a pending foundation line saves at the rate-card price; a below-rate pending line still needs exec approval; a pending line still can't be sent while foundation is unreleased.
