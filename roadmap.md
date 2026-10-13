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

## Legacy archive S3 connection
- [x] Investigate exporter validation; verification stopped with upload failure (Object Lock checksum/signing limitation), as recorded in Harmonious_Legacy_Archive_Verification_Report.md. No migration authorized.

## Marketing menu and post options
- [x] Group Marketing links into a smaller, expandable menu without removing pages or changing access.
- [x] Add a total carousel slide selector (3–10, including cover and closing) and additional brand color choices.
- [x] Verify the changed controls and regression checks; 13 tests passed, isolated synthetic browser controls passed, latest build OK. Publishing settings unchanged.

- [x] Legacy archive checksum upload via general AWS connection; new fixed-retention bucket verified
- [x] Multipart archive uploads (5 MiB SHA-256 parts, resume, abort) tested at 10 MiB and 150 MiB; no exports
- [x] Oct 19 cutoff readiness assessment (read-only): currently NO-GO
- [ ] Manual HubSpot audit + MFA screenshots — blocked on Alyssa
- [x] Import HubSpot deals into Harmonious (300 deals, reconciled) + change tracking + Gmail email logging
- [x] 204 unmatched-owner deals reassigned to McKay; reconciled; authorized reassignment + deal history view tested
- [ ] Staff connect Gmail and run live email logging test — blocked on staff
- [ ] Final catch-up import at cutoff — runs at cutoff
- [ ] Shared inbox/chat replacement decision; forms/meeting links moves — blocked on audit + approval
