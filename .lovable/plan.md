# Make the portal work properly on phone and desktop

Today the portal is built for a wide screen. On a phone the menu opens fine, but several
pages run off the side: tab strips get cut in half, wide tables push the whole page
sideways, and some rows of buttons and figures squash together. Desktop stays as it is —
the goal is that every page is fully usable on a phone without pinching or side-scrolling
the whole screen.

## What will change

**Tabs**
Every tabbed screen (pricing and agreements, home role tabs, staff, client portal, fund
pages, audit) gets a tab strip that scrolls sideways on its own, with the selected tab
kept in view. The page itself no longer moves.

**Tables**
Wide tables (cap table, portfolio value, audit lists, invoices, payments, providers,
holds) sit inside their own horizontal scroll area on small screens, so the table slides
but the page does not. Where a table is really a list of records, it switches to stacked
cards on a phone with the key fields (who, amount, date, status) and the action buttons.

**Headers and toolbars**
Page headers, filter bars and action rows stack on a phone instead of squashing: title on
its own line, filters full width, buttons wrapping to a comfortable tap size. Long names
truncate rather than overflow.

**Figures and cards**
Stat tiles and card grids drop to one or two columns on a phone, and the "Needs you"
strips keep their action buttons on the right at a readable size.

**Forms and dialogs**
Dialogs, sheets and forms fit inside the phone width with scrollable bodies and full-width
buttons; date and money inputs stay tappable.

**Chrome**
Top bar keeps logo, page context and account menu on one row at 390px; the footer links
stack; the calendar view becomes swipeable week/day-friendly rather than a squeezed month
grid.

## Pages covered

Home, client portal (overview, invoices, funds), staff board, sign-off, onboarding,
pricing and agreements, invoices, payments and money, fund payments, audit, client
activity, providers, holds, service requests, fund detail and public fund pages.

## Technical notes

- Add a shared `ScrollableTabs` wrapper around existing `TabsList` usage (overflow-x-auto,
  no wrap, snap, hidden scrollbar) rather than editing each list by hand.
- Add a shared `TableScroll` wrapper (`-mx-4 px-4 overflow-x-auto` pattern) and apply it to
  the 11 table components; keep `min-w-[...]` intact so columns stay readable.
- Apply the responsive header rule: `grid grid-cols-[minmax(0,1fr)_auto]` on mobile,
  promote to `flex` at `sm:`, `min-w-0` on text containers, `shrink-0` on icons.
- Audit `grid-cols-2/3/4` usages that lack a mobile base and prefix them with a
  single-column base.
- No data, permission, scope-gating or wording changes; presentation only.

## Verification

Screenshot each covered page at 390px and 1280px and confirm `document.scrollWidth`
matches the viewport (no page-level horizontal scroll) on every one.
