import { describe, expect, it } from "vitest";
import { buildMessage, dedupeKey, pickOwner } from "@/lib/ops-slack-notify.server";

describe("ops slack notify", () => {
  it("tags operations first, then account manager, else nobody", () => {
    expect(pickOwner([{ role: "account_manager", userId: "am" }, { role: "operations", userId: "op" }])).toEqual({ userId: "op", role: "operations" });
    expect(pickOwner([{ role: "account_manager", userId: "am" }, { role: "operations", userId: null }])?.userId).toBe("am");
    expect(pickOwner([{ role: "sales", userId: "s" }])).toBeNull();
  });
  it("suppresses repeats within five minutes", () => {
    const n = { kind: "k", ref: "r", title: "t" };
    expect(dedupeKey(n, 1_000)).toBe(dedupeKey(n, 200_000));
    expect(dedupeKey(n, 1_000)).not.toBe(dedupeKey(n, 400_000));
  });
  it("message carries only allow-listed fields", () => {
    const m = buildMessage({ title: "Doc", place: "ROAS Hedge LP", submitter: "Ross", mention: null, url: "https://x", when: "now" });
    expect(JSON.stringify(m)).toContain("No Operations owner assigned");
    expect(Object.keys(m)).toEqual(["text", "blocks"]);
  });
});

import { pickOwners as _po } from "./ops-slack-notify.server";
describe("pickOwners", () => {
  it("returns operations then account manager", () => {
    expect(_po([{ role: "account_manager", userId: "b" }, { role: "operations", userId: "a" }])).toEqual([{ userId: "a", role: "operations" }, { userId: "b", role: "account_manager" }]);
  });
});

import { actorLine, investorEventTitle } from "./ops-slack-notify.server";
describe("investor Slack wording", () => {
  it("names the investing party instead of the word Investor", () => {
    expect(investorEventTitle("signature_completed", "Christofer Par")).toBe("Christofer Par signed subscription documents");
    expect(investorEventTitle("signature_completed", "Christofer Par", true)).toBe("Christofer Par's subscription documents are fully signed");
    expect(investorEventTitle("signature_completed", "  ")).toBe("Investor signed subscription documents");
    expect(investorEventTitle("not_an_alert", "X")).toBeNull();
  });
  it("never says someone", () => {
    expect(actorLine({ completed: true, submitter: null, when: "Nov 23, 5:51 PM" })).toBe("Recorded automatically by Harmonious · Nov 23, 5:51 PM");
    expect(actorLine({ completed: true, submitter: "Thomas", automatic: true, when: "now" })).toBe("Recorded automatically by Harmonious · now");
    expect(actorLine({ completed: true, submitter: "Christofer Par", when: "now" })).toBe("Completed by Christofer Par · now");
    expect(JSON.stringify(buildMessage({ title: "t", place: "p", submitter: null, mention: null, url: "https://x", when: "now", completed: true }))).not.toContain("someone");
  });
});
