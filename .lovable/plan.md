# Combine Access Control and Add user into one page

## What changes
- **Access Control** becomes the one place to manage team access. It gets a new first tab, **Invite**, with the same form as today's Add user page (name, email, user type, extra permissions).
- An **Invite user** button at the top of Access Control opens that tab from any other tab.
- After an invite is sent, the People and Needs Review lists refresh, so the new person shows up right away as "invited, waiting for first sign-in".
- **Add user** comes off the Operations menu. Old links to it go straight to Access Control → Invite, so bookmarks still work.
- Who can invite stays the same: the server checks permission on every invite, exactly as it does now.

## Not changing
- Fund access, Operations team, and Legacy permission settings stay where they are.
- Client-side invites (fund managers adding their own people) are not touched.

## Technical details
- Move the form out of `admin.add-user.tsx` into a shared `InviteStaffForm` component; render it inside `access-control-center.tsx` as an `invite` tab. Tab state comes from a `?tab=` search param on `/ops/access-control`.
- `admin.add-user.tsx` redirects in `beforeLoad` to `/ops/access-control?tab=invite`.
- Remove the "Add user" entry from `ops-capabilities.ts`; change the Access Control description to "Invite people, roles, permissions and access audit".
- The Invite tab only appears for people allowed to invite; it still calls `inviteStaff`, which checks permission on the server.
