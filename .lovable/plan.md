# Multiple client accounts per fund manager, with Switch workspace

## What changes for the user
- A fund manager attached to several client accounts (as a client user, a fund manager on one of that client's funds, or a Team member on its funds) sees each client account as its own entry under **Switch workspace**, e.g. "Acme Capital", "Birch Ventures".
- Picking one reloads the portal (Home, My Funds, fund tabs, Cap Table, Settings, Inbox, billing) showing only that client's funds and data.
- The sidebar shows the current client account name, so it is clear where they are working.
- Harmonious staff can add an existing person to another client account from the client's contacts/Access Control (Invite tab); if the email already has a login, they simply gain the new workspace on next load. No new account is created.
- If access to a client is removed, that workspace disappears and they land on their next available one.

## How it works
1. **Workspace list**: replace the single "My company" entry with one entry per client the person is tied to (id `client:<clientId>`, label = client name). Investor, Operations and other workspaces stay as they are.
2. **Entering a workspace**: the server re-checks the person is tied to that client on every switch (existing check, extended to per-client ids) and returns the path.
3. **Active client everywhere**: client-portal screens read the active client from the workspace and pass it to the server; every server read for client data re-verifies membership for that specific client instead of taking "the first client". Fixes spots that currently pick the first membership (e.g. welcome email, portal default, My Funds).
4. **Default**: last chosen client (remembered for the visit only, as today); otherwise the first alphabetically.
5. **Adding to another client**: invite flow accepts an email that already has a login and links it to the new client without changing their other memberships.

## Out of scope
- No change to Operations staff access or fund-level permissions; switching never grants rights, it only filters.
- Investor workspace stays one combined view across all funds.

## Technical details
- `session-resolution.ts`: `availableWorkspaces` emits per-client workspaces from `facts.clientIds` (plus clients of managed/team funds); `canEnterWorkspace` validates `client:<uuid>`. Keep a compatibility mapping for the old `company` id.
- `client-workspace.tsx`: expose `activeClientId`; clear query cache on switch (already done).
- Client-scoped server fns (`client-portal.functions.ts`, `my-funds.functions.ts`, fund tabs, billing, inbox) accept optional `clientId`, verified server-side against membership; remove `memberships[0]` fallbacks.
- Sidebar footer: list client workspaces grouped under "Client accounts" with current name shown.
- Update tests in `workspace-activation.test.ts`; record rule in `src/lib/AGENTS.md`.

## Testing in preview
Add the test fund manager to a second client, sign in, open Switch workspace, pick each client and confirm My Funds shows only that client's funds; try a fund URL from the other client and confirm it is refused.
