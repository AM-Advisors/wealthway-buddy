# Roadmap — Phase 1 Step 6 (Operations Command Center)
- [x] 0. Retire stale historical SPV raise prices (keep for history, not quotable)
- [x] Config: workload weights, capacity thresholds, limit thresholds, approval policies (move fixed thresholds)
- [x] Data layer: one server aggregation (bounded queries, no per-fund loops) + pure priority/SLA/capacity logic + digest data
- [x] Exceptions (deterministic) with acknowledge/resolve state; service reviews queue
- [x] Views: Command Center scoreboard + Needs Attention, My Work, Portfolio, SLA, Client Actions, Investor Exceptions, Third-Party, Reporting, Capital, Calendar, Approvals ops, Requests ops filters, Service Reviews, Capacity, Economics/ACV (restricted), Leadership/package breakdown, Relationship/Administrator/Accounting views
- [x] Safe bulk actions (assign, team, priority, follow-up, acknowledge)
- [x] Sidebar navigation
- [x] Tests, AGENTS.md, manual QA checklist, report
- Deferred (state in report): request upload → Fund Documents linking, staff alerts delivery, saved views persistence, default landing
