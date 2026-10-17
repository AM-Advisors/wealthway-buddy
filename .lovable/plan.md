# "Harmonious only" shows just Harmonious's own work

## What changes
The "Harmonious only" box on a fund's Setup tab currently repeats a separate copy of every setup step. That copy can disagree with the main steps above it, and steps where Harmonious has nothing to do look like they're missing. After this change:

1. **No repeated steps.** The second copy of the setup steps and its separate summary are removed. Each step's status lives only in the main setup sections, which already update as the platform records information.
2. **A short "Waiting on Harmonious" list at the top of the box.** It lists only the steps the main form marks as waiting on Harmonious, with each one's missing items and a link that jumps to that step above. It reads the same live step data as the main form, so the two always match.
3. **A clear empty state.** When no step needs Harmonious, the box says "Nothing needed from Harmonious right now", so nothing looks hidden.
4. **Staff-only tools stay** below that list, unchanged: EIN and Form SS-4, tax documents and the sign-off queue.
5. The same applies on the older admin fund page, which shows the same box.

Nothing changes for fund managers or clients: they never see this box. Permissions and approvals stay the same.

## Technical details
- `src/components/ops-fund-page.tsx`: take `FundSetupCanonical`, its `SetupRequirementsProvider` and the "Entity formation & launch" summary/checklist out of `setupBody`. Keep the `fund-operations` section (`OperationsSs4`, `OperationsTaxDocuments`, `FundSignoffQueue`). The "Next step" banner keeps working from the same `d.tasks` / `d.conditions`.
- `src/routes/_authenticated/admin.fund.$fundId.tsx`: stop passing `FundSetupCanonical` as `staffExtras`.
- `src/components/fund-setup-form.tsx`: inside the "Harmonious only" section, render a list built from `d.steps.filter(s => s.status === "waiting_harmonious")` (label, `missing`, an anchor to `#setup-form-<id>`), followed by `staffExtras`. Show the section chip as "N for Harmonious" or "Nothing needed". No new data or fetching.
- Before removing it, confirm that every control unique to `FundSetupCanonical` that staff still use (for example, approvals recorded on requirements) is either already in a main section or added to the matching one.
- Verify the build and run the existing fund-setup tests.
