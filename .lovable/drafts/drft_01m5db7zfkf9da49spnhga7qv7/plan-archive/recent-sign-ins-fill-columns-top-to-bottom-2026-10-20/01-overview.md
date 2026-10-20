## Recent sign-ins: fill columns top to bottom

Only the "Recent sign-ins" card on People & Access changes. Data, sorting (newest first, up to 8), and who can see it stay the same.

- Two columns, filled down each column: newest 4 on the left (1-4), next 4 on the right (5-8). On narrow screens it stays one column.
- Thin vertical divider between the columns.
- Thin divider line between rows.
- Each row: name on the left, date and time on the right (unchanged).

## Technical details

In `RecentSignIns` (src/routes/_authenticated/ops.people-access.tsx), split `recent` into `recent.slice(0, half)` and `recent.slice(half)` with `half = Math.ceil(recent.length / 2)`. Render a `grid sm:grid-cols-2 sm:divide-x` wrapper with two `<ul className="divide-y">` lists; rows get small vertical padding and column-side padding. Uses the existing border token, no new colors.
