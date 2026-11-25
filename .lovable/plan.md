# Erebor approvals and documents to sign: show them everywhere a manager looks

## The problem
Erebor's approvals show up in the fund's Approvals list. They don't show up on the fund To-do list, on the manager's Home page, or on each investor's row. So Thomas and Harmonious have trouble finding documents that are waiting to be signed or countersigned.

Erebor right now: 2 investors waiting on review, 1 at signature, 1 awaiting funds, 1 funded, 1 at the first step.

## What I'll do
1. **Find out exactly why they're missing (first step).** For each waiting Erebor item, I'll check whether the To-do list, Home and the investor list read it. I haven't confirmed the cause yet. One likely cause is that the investor list's to-dos only count signatures that already have a signing request recorded. The Approvals list reads the fund's reviews directly.
2. **One source for "waiting on you."** The To-do list, the Home page and each investor's row will all read the same list that feeds Approvals. Every item that needs Thomas to approve, sign or countersign will appear in all four places with the same count.
3. **"Documents to sign" at the top of Home.** Managers get a clear card listing each document waiting on them: the investor, the document, how many days it has waited, and one **Sign now** or **Review** button that opens the exact document.
4. **Per investor.** Each investor row shows a badge like **Needs your countersignature**. Opening the investor shows the same single next button.
5. **Harmonious view.** Ops sees the same items marked "Waiting on fund manager" with the number of days, so stuck items are easy to spot. Harmonious still doesn't approve for the manager.
6. **Check it with Erebor's real cases** (read only), plus tests that each waiting item shows in all four places.

## What stays the same
Who can approve, sign or countersign doesn't change. The manager approves and countersigns, the investor signs first, and signed history stays as it is. No production records change and nothing gets published.

## Technical notes
- Reuse fund-setup-reviews and approvals.server as the canonical source. Feed fund-todo-model, manager-investor-todos (buildInvestorTodos signaturePending) and participant-home-model from it.
- Pass the exact-fund countersigner (fund-countersigner.server) so Thomas's items route to him.
- Add tests that assert approvals count = to-do count = home count for a fictional fund.
