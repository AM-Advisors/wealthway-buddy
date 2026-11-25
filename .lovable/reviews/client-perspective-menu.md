# Client perspective surrounding menu

## Result

- A live server-validated Client perspective uses client navigation, even when the signed-in staff member normally has the Operations shell.
- Manager previews read the exact fund's linked client service entitlements, tab switches, cap-table status and fund optional-service coverage. Previews without a manager login use the same exact client, never the staff member's purchases.
- Investor previews reuse existing subject-scoped service readers.
- Both the outer sidebar and the existing Client View page selector apply the shared client navigation and menu filters.
- Navigation remains inside existing read-only Client View readers. Manager Home returns to the canonical exact fund workspace.
- Staff favorites and staff inbox counts are not projected as client activity. Staff account controls remain their own, not the client's account.
- Operations menus, unrelated funds, ordinary client purchases and server authorization are unchanged.

## Evidence

- 23 focused tests passed across client-perspective-menu, its server reader, client-preview-plan, service-menu and client-tab-access.
- Actual ClientSidebar rendered in an isolated browser harness at 1280×1800 and 740×772. Real server-function and external requests were blocked. Fictional client services hid staff-only optional purchases; changing the fictional client services updated visible links; Reports stayed in preview; exiting restored the ordinary menu. No page errors.
- Screenshots inspected at `/tmp/browser/client-menu/menu-1280.png` and `menu-740.png`.
- Latest preview build passed after narrowing the loaded menu before using it inside mapped links.
- The pre-existing broader View As suite still has two failing broad source-pattern assertions about its existing display-name fallback, as recorded in the previous review. That reader and those assertions were not modified.
- No production records, access grants, identity decisions, money paths, auth settings or schema changed. Nothing published. Actual signed-in production entry and reads remain unverified.

Sandbox validated; production verification pending.