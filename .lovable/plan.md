# Finish the service request form and client portal split

The last two builds were coded but not tested in the app; the workspace crashed partway, and the Funds tab links into fund-manager pages a client user may not be allowed to open.

## What gets finished

1. **Fund page inside the client portal**
   - Each fund card's "Open fund" goes to a page within the client portal (Funds tab stays selected), not the fund-manager area.
   - Shows: fund details (legal entity, type, state, formation date, exemption), setup progress %, Harmonious steps marked "Harmonious — pending", investor count and committed/funded totals, and the fund's read-only cap table and side letters.
   - Access: members of the client that owns the fund, plus Harmonious staff; checked on the server each time. Fund managers keep their existing pages.
2. **Service request form checks**
   - Confirm the dropdowns, auto-picked structure, auto-ticked main services, exemption-driven "Who can invest" box, calendar and %/$ toggles work for Launch SPV and every Launch Fund type.
   - Confirm "Other" free text saves, and the eligibility text is saved with the request.
3. **Request detail page checks**
   - Opens from Your services → Recent requests; edits save only while waiting on Harmonious; progress shows "Harmonious — pending" correctly for each status.
4. **Portal tabs check**
   - Funds, Cap Table and Settings tabs highlight correctly; Settings side menu only shows under Settings; works on phone width.
5. **Tests** for the auto-picked services and exemption eligibility rules.

## Technical details

- New route `client.funds.$fundId.tsx` (note: `client.funds.tsx` becomes a layout with `<Outlet />`; list moves to `client.funds.index.tsx`).
- New `getClientFund` server fn in `client-services.functions.ts`: requireSupabaseAuth, verify caller's client membership owns the offering (or staff), then reuse existing `buildFundCapTable`, side-letter list and Fund Setup completion helpers — no new data models.
- Unit tests in `src/lib/client-portal-model.test.ts` for `coreServicesFor`, `defaultVehicle`, `eligibilityFor`.
- Browser pass via Playwright with a minted session; screenshots reviewed.
- Mark the matching roadmap items done.
