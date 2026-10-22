import { describe, expect, it } from "vitest";
import { salesProgress } from "./sales-progress";

const done = (s: ReturnType<typeof salesProgress>) => s.filter((x) => x.done).map((x) => x.key);

describe("sales progress", () => {
  it("a draft only has the draft step", () => {
    expect(done(salesProgress({ status: "draft" }))).toEqual(["draft"]);
  });
  it("sent implies approved", () => {
    expect(done(salesProgress({ status: "sent", events: [{ event: "sent", created_at: "2026-10-01" }] }))).toEqual(["draft", "approved", "sent"]);
  });
  it("paid only when the invoice is paid", () => {
    expect(done(salesProgress({ status: "signed", signedAt: "x", sowStatus: "draft", invoiceStatus: "open" }))).not.toContain("paid");
    expect(done(salesProgress({ status: "signed", signedAt: "x", sowStatus: "executed", invoiceStatus: "paid" }))).toContain("paid");
  });
});
