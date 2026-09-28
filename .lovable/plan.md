# View As / Manage Client — phased plan

## Why this is phased (brief stop condition)
Every client screen today works out "whose data" from the signed-in account: about 176 server modules, 666 places that use the signed-in user and 1,067 database reads filtered by the signed-in user. The only ways to show the *entire* real client app as someone else in one step are:
- use the client's sign-in token, which the brief forbids as account takeover; or
- rewrite every screen at once, which is too large to do safely in one pass.

So View As will be switched on **one screen at a time**. Each screen is converted to take a server-checked "perspective" and is then tested. Screens that haven't been converted show "Not yet available in client view" instead of an approximate copy.

## Phase 1 (this build)
1. **Choosing a perspective, checked on the server**
   - Staff pick a perspective reference from the list the server offers. They never type a user ID, fund ID or role.
   - The server checks that the staff member is Harmonious staff with the view-as permission, and that the relationship is real: a manager assigned to that exact fund, an investor with an onboarding for that investment, or an active delegation. Email, domain and name are never used to match.
   - Supported perspectives: Investor (one investment), Fund Manager (one fund, one real manager), Client principal (one client). Company and Professional follow in Phase 2.
2. **The perspective is tied to the session**
   - It is stored server-side, linked to the staff member's current sign-in, and expires after 60 minutes.
   - It ends on sign-out, on Exit, or when switching to another client, fund or investor. Only one perspective can be active at a time.
3. **Screens converted first**
   - The investor's investment page (journey and Investment Checklist).
   - The fund manager's Fund workspace: Overview, Investors and Readiness.
   - Investor-safe and manager-safe labels are reused. Staff never see more than both sides allow: sensitive tax, TIN, ID, KYC/AML, accreditation evidence and bank details stay governed by the staff member's own permissions.
4. **Read-only by default**
   - While View As is active, the server refuses every change made through the perspective.
   - Buttons that would change something are disabled, but the server check is what actually blocks the change.
   - Opening pages saves nothing.
5. **Banner and exits**
   - A persistent banner reads "Viewing as [Name] — [Role]", with the fund and investment on a second line and "You are signed in as Harmonious staff."
   - It has **Return to Harmonious Operations** and **Exit Client View** buttons.
6. **Edit as Harmonious**
   - This is an explicit switch that opens the existing Operations form for that record, with the notice "You are editing this record as Harmonious…".
   - Saving goes through the existing checked save paths and is recorded under the staff member's real account. The record also notes that View As was active, which perspective was being viewed, and the before and after values.
   - A reason is required for material fields: legal name, entity name, amounts, legal address, ownership/control, offering terms and close economics.
   - Nothing is ever recorded as done by the client.
7. **Where you start View As**
   - Buttons on Client 360, Fund 360 and investor records, labelled "See Client View".
   - On each row of the Investment readiness queue: "View as Investor" and "View as Fund Manager". For funds with several managers, you choose which manager.
8. **What gets recorded**
   - Each start and exit is recorded as a staff access event. The client's sign-in history and security settings are never touched.

## Phase 2+ (later passes, one screen at a time)
Client portal pages, Company and cap-table screens, Professional/delegation screens, documents and reports, and View as Fund Manager from Close Request review.

## Technical details
- New table `view_as_sessions` (server-only; staff_user_id, session id, perspective kind, subject ids, created/ended_at, expires_at) and audit events in the existing append-only access audit.
- New atomic permission `administration.view_as`, with Super Administrator and Operations Admin getting it by default.
- `src/lib/view-as.server.ts`: `startViewAs`, `endViewAs`, and `resolvePerspective(staffUserId)`, which checks the relationship again on every call.
- The converted screens' server functions take the effective subject from the perspective, never from request data, and read through the existing investor- and manager-view helpers.
- A write guard refuses changes while a perspective is active.
- The shared layout reads the active perspective to show the banner.
- Tests: authorization, fund and investment scoping, read-only enforcement, attribution, no elevation, internal notes hidden, exit and switch clearing, tampered IDs rejected, and nothing saved from page views.
- No production records are touched. Testing uses unit tests and read-only browser checks.
