import { describe, expect, it } from "vitest";
import { newTabSigningUrl } from "./sign-window-url";
describe("newTabSigningUrl", () => {
  it("turns an embedded signing link into the full-page link", () => {
    expect(newTabSigningUrl("https://harmonious.app.box.com/embed/sign/document/abc/def/")).toBe("https://harmonious.app.box.com/sign/document/abc/def/");
  });
  it("refuses non-https or missing links", () => {
    expect(newTabSigningUrl("javascript:alert(1)")).toBeNull();
    expect(newTabSigningUrl(null)).toBeNull();
  });
});
