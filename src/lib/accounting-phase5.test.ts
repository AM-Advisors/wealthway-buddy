import { describe, expect, it } from "vitest";
import { trialBalance, ledgerCashCents } from "./ledger-trial-balance";
import { classifyInbound, computeDrift, currentMappings, hmsTag, parseQboJournalCsv, parseQboTrialBalanceCsv, toCents, toQboJournalCsv, outboundDecisionAllowed } from "./qbo-sync-model";
import { alertState, canApplyAlertAction, detectAlerts } from "./bank-alerts";
import { canDecideCloseSheet, investorClosingTotals, monthBounds, monthEndChecklist } from "./close-sheets";

const accts = [
  { id: "c", code: "1000", name: "Cash", account_type: "asset", normal_balance: "debit", subtype: "cash" },
  { id: "e", code: "3000", name: "Capital", account_type: "equity", normal_balance: "credit", subtype: "partner_capital" },
];

describe("trial balance", () => {
  it("signs balances by normal side and ties", () => {
    const tb = trialBalance(accts, [{ account_id: "c", debit_cents: 500, credit_cents: 0 }, { account_id: "e", debit_cents: 0, credit_cents: 500 }]);
    expect(tb.ties).toBe(true);
    expect(tb.rows.map((r) => r.balanceCents)).toEqual([500, 500]);
    expect(ledgerCashCents(tb.rows.map((r) => ({ ...r, subtype: accts.find((a) => a.id === r.id)!.subtype })))).toBe(500);
  });
  it("reports when it does not tie", () => {
    expect(trialBalance(accts, [{ account_id: "c", debit_cents: 5, credit_cents: 0 }]).ties).toBe(false);
  });
});

describe("QuickBooks exchange", () => {
  const csv = `Journal No,Journal Date,Account,Debits,Credits,Memo\n7,03/31/2026,Checking,"1,000.00",,Fee\n7,03/31/2026,Mgmt Fees,,1000.00,Fee\n`;
  it("parses journal exports and amounts", () => {
    const { txns } = parseQboJournalCsv(csv);
    expect(txns).toHaveLength(1);
    expect(txns[0]!.date).toBe("2026-03-31");
    expect(txns[0]!.lines[0]!.debitCents).toBe(100000);
    expect(toCents("(12.50)")).toBe(-1250);
  });
  it("needs mappings, skips duplicates and our own entries", () => {
    const t = parseQboJournalCsv(csv).txns[0]!;
    expect(classifyInbound(t, new Map(), new Set()).outcome).toBe("needs_mapping");
    const maps = new Map([["checking", "c"], ["mgmt fees", "e"]]);
    expect(classifyInbound(t, maps, new Set()).outcome).toBe("drafted");
    expect(classifyInbound(t, maps, new Set(["7"])).outcome).toBe("skipped_duplicate");
    expect(classifyInbound({ ...t, memo: `x ${hmsTag("abcdef1234")}` }, maps, new Set()).outcome).toBe("skipped_ours");
    expect(classifyInbound({ ...t, lines: [t.lines[0]!] }, maps, new Set()).outcome).toBe("unbalanced");
  });
  it("latest mapping wins", () => {
    const m = currentMappings([{ qbo_account_name: "Checking", account_id: "a", created_at: "2026-01-01" }, { qbo_account_name: "checking ", account_id: "b", created_at: "2026-02-01" }]);
    expect(m.get("checking")).toBe("b");
  });
  it("exports with our marker so re-imports are recognised", () => {
    const out = toQboJournalCsv([{ id: "abcdef1234", entryNo: 3, date: "2026-03-31", memo: "Fee", lines: [{ accountName: "Checking", debitCents: 100, creditCents: 0 }, { accountName: "Fees", debitCents: 0, creditCents: 100 }] }]);
    const back = parseQboJournalCsv(out).txns[0]!;
    expect(classifyInbound(back, new Map([["checking", "c"], ["fees", "e"]]), new Set()).outcome).toBe("skipped_ours");
  });
  it("computes drift through mappings", () => {
    const { rows } = parseQboTrialBalanceCsv("Account,Debit,Credit\nChecking,500.00,\nUnknown,,1.00\nTOTAL,500,1\n");
    const d = computeDrift(rows, new Map([["c", 40000]]), new Map([["checking", "c"]]));
    expect(d.rows[0]!.diffCents).toBe(10000);
    expect(d.rows[1]!.mapped).toBe(false);
    expect(d.maxDiffCents).toBe(10000);
  });
  it("outbound needs a second person", () => {
    expect(outboundDecisionAllowed("u1", "u1")).toBe(false);
    expect(outboundDecisionAllowed("u1", "u2")).toBe(true);
  });
});

describe("bank alerts", () => {
  const now = new Date("2026-04-10T12:00:00Z");
  it("flags each of the four kinds", () => {
    const a = detectAlerts({
      offeringId: "f", now,
      deposits: [{ id: "d1", posted_on: "2026-04-01", amount_cents: 100, name: "x", matched_application_id: null, matched_invoice_id: null, matched_wire_request_id: null },
        { id: "d2", posted_on: "2026-04-09", amount_cents: 100, name: "new", matched_application_id: null, matched_invoice_id: null, matched_wire_request_id: null }],
      withdrawals: [{ plaidId: "w1", date: "2026-04-05", amountCents: 900, name: "out" }, { plaidId: "w2", date: "2026-04-05", amountCents: 500, name: "paid" }],
      approvedPayments: [{ amountCents: 500, date: "2026-04-03" }],
      accounts: [{ id: "b", status: "connected", last_synced_at: "2026-04-01T00:00:00Z", institution_name: "Bank", account_mask: "1234" }],
      bankBalanceCents: 10000, balanceAsOf: "2026-04-10", ledgerCashCents: 9000,
    });
    expect(a.map((x) => x.kind).sort()).toEqual(["balance_mismatch", "feed_stale", "unexpected_withdrawal", "unmatched_deposit"]);
    expect(a.find((x) => x.kind === "unexpected_withdrawal")!.amountCents).toBe(900);
  });
  it("tolerates small balance differences", () => {
    expect(detectAlerts({ offeringId: "f", now, bankBalanceCents: 1000, balanceAsOf: "2026-04-10", ledgerCashCents: 950 })).toHaveLength(0);
  });
  it("derives state from history and guards actions", () => {
    const ev = [{ action: "acknowledged" as const, created_at: "1", actor_user_id: "u" }, { action: "resolved" as const, created_at: "2", actor_user_id: "u", note: "ok" }];
    expect(alertState(ev).state).toBe("resolved");
    expect(canApplyAlertAction("open", "resolved", "")).toMatch(/Explain/);
    expect(canApplyAlertAction("resolved", "acknowledged")).toMatch(/Reopen/);
    expect(canApplyAlertAction("resolved", "reopened", "again")).toBeNull();
  });
});

describe("close sheets", () => {
  it("totals investor closings", () => {
    const t = investorClosingTotals([{ applicationId: "a", investor: "A", committedCents: 100, calledCents: 100, receivedCents: 0, signature: "Signed", funding: "pending" }]);
    expect(t).toMatchObject({ investors: 1, committedCents: 100, unreceived: 1, unsigned: 0 });
  });
  it("month-end requires every item and drift when QuickBooks is linked", () => {
    const base = { hasBook: true, unreconciledBankItems: 0, openBankAlerts: 0, unpostedEntries: 0, trialBalanceTies: true, latestDriftMaxCents: null, driftExplained: false, qboLinked: false };
    expect(monthEndChecklist(base).ready).toBe(true);
    expect(monthEndChecklist({ ...base, qboLinked: true }).ready).toBe(false);
    expect(monthEndChecklist({ ...base, qboLinked: true, latestDriftMaxCents: 500, driftExplained: true }).ready).toBe(true);
    expect(monthEndChecklist({ ...base, openBankAlerts: 1 }).ready).toBe(false);
  });
  it("needs a different signer and a reason to return", () => {
    expect(canDecideCloseSheet("u", "u", "approved")).toMatch(/someone other/);
    expect(canDecideCloseSheet("u", "v", "returned", "")).toMatch(/why/);
    expect(canDecideCloseSheet("u", "v", "approved")).toBeNull();
  });
  it("month bounds", () => {
    expect(monthBounds("2026-02")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
  });
});
