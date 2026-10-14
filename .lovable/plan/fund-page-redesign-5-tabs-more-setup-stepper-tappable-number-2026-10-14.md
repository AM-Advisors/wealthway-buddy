# Fund page redesign: 5 tabs + More, setup stepper, tappable numbers

Applies to both the Operations fund page and the client fund page, since they share one fund view. Nothing changes about who can do what. Every action keeps its own server-side check.

## 1. Navigation: 5 main tabs + "More"
Today there are 18 tabs across two rows. They become one row:

```text
[ Overview ] [ Setup ] [ Investors ] [ Accounting ] [ Documents ] [ More v ]
```

- **Overview:** today's Command Center.
- **Setup:** the checklist (see section 2). Fund Details, Team and Banking become steps inside it.
- **Investors:** today's Investors tab.
- **Accounting:** today's Accounting tab, with Assets, Closes and Distributions as sub-sections inside it.
- **Documents:** today's Documents tab.
- **More** (a dropdown menu): To-dos (with count), Approvals, Requests, Calendar, Activity & record, Regulatory, Services, plus Fund Details, Team and Banking as direct shortcuts.
- When a page under More is open, the More button shows its name (for example "More: Approvals"), so you can always see where you are.
- Existing links and saved tab addresses keep working; each old tab name maps to its new home.
- On a phone, the row scrolls sideways instead of wrapping onto a second line.

## 2. Setup as a progress stepper
"Load your fund information" becomes numbered steps with a progress bar:

```text
Setup  ███████░░░  3 of 6 complete
 1  Fund details        ✓ Approved                   (collapsed)
 2  Fees & team         ● Waiting for Harmonious review   [Review]
 3  Bank / wire         ○ Not started                [Add]
 4  Documents           ● Waiting for review (2)     (expanded)
 ...
```

- Finished steps collapse to one line with a check mark and can be tapped to reopen.
- The first unfinished step opens by default and shows its form or submissions inline.
- Each step shows its status, who it's waiting on (You, Harmonious or the fund manager) and one main button.
- "Submissions to review" moves inside the step it belongs to. For example, the Operating Agreement sits under Documents rather than in a separate list underneath.
- On the Operations page, steps waiting for review show **Review** instead of **Update**, so staff land directly on approve or return.
- The percentage and progress bar keep coming from the one existing setup calculation, so the number matches everywhere.

## 3. Top numbers: same six, now tappable
- Setup goes to Setup, Investors to Investors, Committed and Funded to Investors (funding view), Open to-dos to To-dos, and Next deadline to Calendar.
- Each tile shows a small arrow and highlights when touched or hovered.
- **To investigate first:** the screenshot shows ROAS Hedge LP with 0 investors and $0 committed, although six investors were added. I'll check where these numbers are drawn from before changing the tiles, and report or fix the cause.

## Technical details
- `src/components/fund-workspace.tsx`: replace the `TabsList` with 5 `TabsTrigger`s plus a `DropdownMenu` "More". Add a `TAB_ALIASES` map from old tab values to their new homes, applied in `onTab` and on load. Accounting gets inner sub-tabs for Assets, Closes and Distributions. KPI cards become buttons that call `onTab`.
- `src/components/fund-manager-setup-loader.tsx` and the setup tab content: a new `SetupStepper` component using the existing step and status data from `fund-launch-summary.ts`, with collapsible sections (shadcn Collapsible) and submissions grouped by step.
- Investor and committed totals: check the data behind the investor and committed totals (`cap.totals`) against ROAS onboardings before any UI change.
- Styling uses existing design tokens only. A browser check runs on a phone-sized and a desktop view after the build.
