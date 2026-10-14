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
