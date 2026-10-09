import { describe, expect, it } from "vitest";
import { computeSyntheticAllocation } from "./synthetic-allocation";
import { walkthroughQ1AllocationInput } from "./reference-fund/walkthrough-q1-allocation";
import { buildSyntheticStatement, channelError, SYNTHETIC_STATEMENT_LABEL as L, syntheticStatementPdfSpec, type SynAccount, type SynMovement } from "./synthetic-statement";

const input = walkthroughQ1AllocationInput({ sourceOnlyApproved: true });
const r = computeSyntheticAllocation(input);
if (!r.ok) throw new Error("blocked");
const O = input.offeringId;
const accounts: SynAccount[] = r.lines.map((l) => {
  const p = input.participants.find((x) => x.positionId === l.positionId)!;
  return {
    id: `acct-${l.positionId}`, offering_id: O, position_id: l.positionId, investor_name: l.name, class_label: l.classLabel,
    admission_status: p.admissionStatus, opening_capital_source: p.sourceRef, policy_version: 1, allocation_run_id: "run", period_start: "2026-01-01", period_end: "2026-03-31", version: 1, classification: L,
    opening_capital_cents: l.openingCapitalCents, contributions_cents: l.contributionsCents, interest_cents: l.interestCents, unrealized_gain_cents: l.unrealizedGainCents,
    operating_expense_cents: l.operatingExpenseCents, management_fee_cents: l.managementFeeCents, ending_capital_cents: l.endingCapitalCents,
    unpaid_call_cents: l.unpaidCallCents, credits_liability_cents: l.creditsCents, restrictions: l.restrictions,
  };
});
const mv = (a: SynAccount, kind: string, amount: number, ref = kind, date = "2026-03-31"): SynMovement => ({ account_id: a.id, offering_id: O, kind, amount_cents: amount, effective_date: date, source_ref: ref, classification: L });
const movements: SynMovement[] = accounts.flatMap((a) => [
  mv(a, "opening", a.opening_capital_cents), mv(a, "interest_income", a.interest_cents), mv(a, "unrealized_gain_synthetic", a.unrealized_gain_cents),
  mv(a, "operating_expense", a.operating_expense_cents), mv(a, "management_fee", a.management_fee_cents),
  ...input.contributions.filter((c) => c.positionId === a.position_id).map((c) => mv(a, "contribution", c.amountCents, `${c.sourceRef}@${c.receivedOn}`, c.receivedOn)),
]);
const opts = { channel: "internal_preview" as const, navCents: 1_392_991_250, fundIsTestDemo: true, residualCents: 0 };
const build = (a: SynAccount, m = movements, o = opts) => buildSyntheticStatement(a, m, o);
const find = (n: string) => accounts.find((a) => a.investor_name.startsWith(n))!;

describe("synthetic statement previews", () => {
  const all = accounts.map((a) => build(a));
  it("builds 13 statements that tie to their accounts and to NAV", () => {
    expect(movements).toHaveLength(76);
    expect(all.every((x) => x.ok)).toBe(true);
    const total = all.reduce((s, x) => s + (x.ok ? x.statement.endingCapitalCents : 0), 0);
    expect(total).toBe(1_392_991_250);
    for (const x of all) if (x.ok) expect(x.statement.lines.reduce((s, l) => s + l.cents, 0)).toBe(x.statement.endingCapitalCents);
  });
  it("covers both classes, source-only, unpaid calls, AML, credit and Blake", () => {
    const s = (n: string) => { const x = build(find(n)); if (!x.ok) throw 0; return x.statement; };
    expect(new Set(accounts.map((a) => a.class_label))).toEqual(new Set(["A", "B"]));
    for (const n of ["Northwind", "Cedar", "Atlas"]) expect(s(n).badges).toContain("SOURCE-ONLY / NOT FORMALLY ADMITTED");
    expect(s("Juniper").unpaidCallCents).toBe(50_000_000);
    expect(s("Erik").restrictions.join()).toMatch(/AML/);
    expect(s("Erik").endingCapitalCents).toBeGreaterThan(0);
    expect(s("Ada").creditsCents).toBe(5_000);
    expect(s("Ada").lines[1].cents).toBe(30_000_000);
    expect(s("Blake").contributions).toHaveLength(0);
    expect(s("Northwind").lines[5].cents).toBe(-2_500_000);
  });
  it("PDF spec carries the watermark on every page and all disclosures", () => {
    const x = build(find("Northwind")); if (!x.ok) throw 0;
    const spec = syntheticStatementPdfSpec(x.statement, "Harmonious Walkthrough Fund");
    expect(spec.watermark).toBe(L);
    expect(spec.notes?.join(" ")).toMatch(/Carried interest and waterfall/);
    expect(spec.fileName).toMatch(/^SYNTHETIC-INTERNAL-/);
  });
});

describe("refusals", () => {
  const a = find("Kestrel");
  it("missing movement", () => { const r = build(a, movements.filter((m) => !(m.account_id === a.id && m.kind === "interest_income"))); expect(r.ok).toBe(false); });
  it("duplicated movement", () => { const dup = movements.find((m) => m.account_id === a.id && m.kind === "management_fee")!; expect(build(a, [...movements, dup]).ok).toBe(false); });
  it("removed synthetic label", () => expect(build({ ...a, classification: "VERIFIED" }).ok).toBe(false));
  it("real fund", () => expect(build(a, movements, { ...opts, fundIsTestDemo: false }).ok).toBe(false));
  it("cross-fund movement", () => expect(build(a, movements.map((m) => (m.account_id === a.id && m.kind === "opening" ? { ...m, offering_id: "x" } : m))).ok).toBe(false));
  it("balance not tying (no plug)", () => expect(build({ ...a, ending_capital_cents: a.ending_capital_cents + 1 }).ok).toBe(false));
  it.each(["investor_portal", "email", "public_link", "production_statement", "financial_report"] as const)("channel %s", (c) => {
    expect(channelError(c)).toMatch(/internal preview only/);
    expect(build(a, movements, { ...opts, channel: c }).ok).toBe(false);
  });
});
