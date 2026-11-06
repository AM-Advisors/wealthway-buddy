import { describe, it, expect } from "vitest";
import { collapseSamePersonRows } from "./ops-records";
const row = (id: string, email: string, fund: string) => ({ id, title: "Jason Dang", subtitle: email, status: null, stage: null, clients: [], funds: [{ fundId: fund, fundName: fund, clientId: null, clientName: null }] });
describe("one row per grouped person", () => {
  it("collapses grouped logins and keeps both funds", () => {
    const out = collapseSamePersonRows([row("a", "a@x.co", "F1"), row("b", "b@x.co", "F2")], new Map([["a", "g"], ["b", "g"]]));
    expect(out).toHaveLength(1); expect(out[0]!.funds.map((f) => f.fundId)).toEqual(["F1", "F2"]); expect(out[0]!.subtitle).toBe("a@x.co · also b@x.co");
  });
  it("same name without a staff group stays two rows", () => {
    expect(collapseSamePersonRows([row("a", "a@x.co", "F1"), row("b", "b@x.co", "F2")], new Map())).toHaveLength(2);
  });
});
