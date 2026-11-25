# Client perspective purchase-message check

**Rule:** Opening an authorized, read-only Client perspective must not require Harmonious staff to buy that client's services personally. Real clients keep their existing service and access checks.

## Checked places

| Place | Code read | Finding |
| --- | --- | --- |
| Fund Client perspective button and automatic single-person choice | `src/components/view-as.tsx`, `src/lib/view-as.ts` | Opens the canonical manager fund page. No purchase check here. |
| Shared signed-in purchase-message gate, including every manager fund section | `src/routes/_authenticated/route.tsx`, `src/lib/saas-order-model.ts` | **Corrected:** it checked the staff account's purchases before showing the preview. Only a matching server-validated staff fund preview now omits that message; ordinary clients and other services remain unchanged. |
| Preview resolution and session checks | `src/lib/view-as.server.ts`, `src/lib/view-as.functions.ts` | Server checks staff identity, current sign-in, expiration and the recorded relationship. Unchanged. |
| Investor Client View, its page selector, home and readiness calls | `src/routes/_authenticated/view-as.tsx`, `src/components/investment-readiness.tsx`, investor read functions in `src/lib/view-as.server.ts` | Investor pages stay under `/view-as`, which is not purchase-gated. Their readers resolve the subject's records. Unchanged. |
| Return to Client View, exit and edit context | `src/components/view-as.tsx`, `src/lib/view-as.server.ts` | Return goes through `/view-as` and then the same fund gate; this correction covers that route too. Exit removes the perspective. Edit mode is not given the preview exception. |
| Fund workspace and preview banner | `src/components/fund-workspace-layout.tsx` | Requires the matching fund context for the banner/read-only region. Original fund readers still authorize independently. Unchanged. |
| Fund record reader and viewer routing | `src/lib/manager-fund.functions.ts`, `getFundOpenMode` in `src/lib/fund-team-access.functions.ts` | No purchase-message check. Existing admin/manager and viewer checks remain. Some staff roles may still get a separate fund-access error; authority was not broadened. |
| Outer client menu | `src/components/client-sidebar.tsx`, `src/components/client-workspace.tsx`, `src/lib/navigation.ts` | **Potential separate mismatch:** if the client shell is used, surrounding service links use the signed-in staff account's purchases, not the previewed client's services. No menu change made in this request. |
| Purchased-service reader | `myEntitlements` in `src/lib/saas-orders.server.ts` | Intentionally reads the caller's client purchases and adds fund-menu visibility for recorded managers. Kept unchanged for real clients. |
| Billing warnings | `lostAreas` in `src/lib/billing-records.server.ts` | Uses purchase rules for real service changes, not previews. Unchanged. |
| Portal entry | `src/lib/portal-access.functions.ts` | Invitation/account entry is separate from purchase messaging. Unchanged. |
| Preview database records | `drizzle/migrations/0057_view_as_sessions.sql`, preview column in `0113_client_inbox_threads_and_view_as_preview.sql` | Service-only session table with sign-in, expiration, end state and preview flag. No purchase check or preview-specific database function in these migrations. No schema or record changes. |
| Background paths | Call sites for `startViewAsFn`, `returnToClientViewFn`, `viewAsPageFn`, `viewAsFundFn`, `viewAsInvestmentFn`, and `requiredEntitlement` searched across `src` | No background job starts a client preview or renders this message. Purchase/billing behavior remains unchanged. |

## Verification

- 14 focused preview and purchase tests passed.
- Fictional browser check: ordinary unpurchased page blocked, matching read-only fund preview displayed, exit restored the purchase message. Checked at 1280px and 740px, with real requests blocked and no page errors.
- Preview build passed.
- The larger existing View As suite had 21 passing checks and two failing broad-source assertions: its pre-existing display-name fallback reads an account label, which those assertions incorrectly treat as relationship matching or sign-in mutation. Neither that code nor those assertions changed here.
- Actual authenticated preview entry and fund reads remain unverified. No live records, purchases, permissions, settings or settled history changed. Not published.