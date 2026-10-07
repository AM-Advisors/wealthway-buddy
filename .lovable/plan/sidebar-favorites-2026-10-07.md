# Sidebar Favorites

## What you get
- A **Favorites** section at the top of every sidebar (staff, fund manager/client, investor), just under Home.
- A star next to each sidebar item (shown on hover) and a "Save to favorites" star in each page header, so any page — including a specific fund, client or investor — can be saved.
- Favorites can be renamed, reordered (move up/down) and removed; the section hides when empty.
- Favorites are personal, follow the person across devices, and never grant access: if someone loses access to a saved page, it is hidden from their list.

## How it works
- Saving stores the page address, a label and an icon for the signed-in person only.
- Up to 25 favorites per person.
- In the staff sidebar, favorites are filtered by the same role standard as the rest of the menu.

## Technical details
- Migration: `user_favorites` (id, user_id → auth.users, url text, label text, icon text, position int, created_at; unique(user_id, url)). GRANT select/insert/update/delete to authenticated, all to service_role; RLS with `user_id = auth.uid()` for every operation.
- `src/lib/favorites.ts` (browser client + React Query hook `useFavorites`: list, add, rename, move, remove; optimistic updates).
- `src/components/sidebar-favorites.tsx` (Favorites group) and `favorite-star.tsx` (toggle button), used in `ops-sidebar.tsx`, the fund-manager/client sidebar and the investor sidebar; star added to the shared page header.
- URL validation: only same-app paths starting with "/" (no external links).
- Rule recorded in `src/lib/AGENTS.md`.
