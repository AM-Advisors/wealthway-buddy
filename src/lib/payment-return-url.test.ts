import { describe, expect, it } from "vitest";
import { isAllowedReturnUrl, requireAllowedReturnUrl } from "./payment-return-url";

describe("payment return addresses", () => {
  it("accepts Harmonious, white-label, published and this project's preview addresses", () => {
    expect(isAllowedReturnUrl("https://app.harmonious.co/client/billing")).toBe(true);
    expect(isAllowedReturnUrl("https://ops.harmonious.co/ops/x?y=1")).toBe(true);
    expect(isAllowedReturnUrl("https://app.acme.harmonious.co/client")).toBe(true);
    expect(isAllowedReturnUrl("https://wealthway-buddy.lovable.app/plan/setup")).toBe(true);
    expect(isAllowedReturnUrl("https://id-preview--0d29ab32-07e0-42f9-a3fc-80d86f0b9c9a.lovable.app/x")).toBe(true);
    expect(isAllowedReturnUrl("http://localhost:8080/x")).toBe(true);
  });
  it("refuses outside sites, other projects, look-alikes and credentials", () => {
    expect(isAllowedReturnUrl("https://evil.example/harmonious.co")).toBe(false);
    expect(isAllowedReturnUrl("https://someone-else.lovable.app/")).toBe(false);
    expect(isAllowedReturnUrl("https://app.harmonious.co.evil.example/")).toBe(false);
    expect(isAllowedReturnUrl("https://evilharmonious.co/")).toBe(false);
    expect(isAllowedReturnUrl("http://app.harmonious.co/")).toBe(false);
    expect(isAllowedReturnUrl("https://user:pw@app.harmonious.co/")).toBe(false);
    expect(isAllowedReturnUrl("javascript:alert(1)")).toBe(false);
    expect(() => requireAllowedReturnUrl("https://evil.example/")).toThrow();
  });
});
