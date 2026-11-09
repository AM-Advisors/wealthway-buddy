import { describe, it, expect } from "vitest";
import { plainEmailText, plainEmailLine } from "@/lib/outbound-email-guard";
describe("plainEmailText", () => {
  it("removes outside links and markup, keeps harmonious links", () => {
    const out = plainEmailText("Hi <b>there</b> https://evil.example/x and https://app.harmonious.co/home www.bad.com\n\n\n\nbye");
    expect(out).toBe("Hi there [link removed] and https://app.harmonious.co/home [link removed]\n\nbye");
  });
  it("rejects lookalike and http harmonious hosts", () => {
    expect(plainEmailText("https://harmonious.co.evil.com/a http://app.harmonious.co")).toBe("[link removed] [link removed]");
  });
  it("single line", () => { expect(plainEmailLine("a\n\nb   c")).toBe("a b c"); });
});
