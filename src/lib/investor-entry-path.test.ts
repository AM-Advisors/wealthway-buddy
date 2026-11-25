import { describe, expect, it } from "vitest";
import { investorEntryPath } from "./investor-entry-path";
describe("investor invitation return paths", () => {
  it("retains dedicated links through account setup", () => {
    expect(investorEntryPath("?next=%2Fjoin%2Fabcdefghijklmnopqrstuvwx")).toBe("/join/abcdefghijklmnopqrstuvwx");
  });
  it("retains emailed invitations", () => {
    expect(investorEntryPath("?next=/onboard/abcdefghijklmnop")).toBe("/onboard/abcdefghijklmnop");
  });
  it("retains investment entries", () => {
    expect(investorEntryPath("?next=/onboard/i/12345678-1234-1234-1234-123456789abc")).toBe("/onboard/i/12345678-1234-1234-1234-123456789abc");
  });
  it("retains Joe’s contact invitation through account setup", () => {
    expect(investorEntryPath("?next=/onboard/contact/abcdefghijklmnop")).toBe("/onboard/contact/abcdefghijklmnop");
  });
  it("retains a paperwork preparer invitation through account setup", () => {
    expect(investorEntryPath("?next=/onboard/prepare/abcdefghijklmnop")).toBe("/onboard/prepare/abcdefghijklmnop");
    expect(investorEntryPath("?next=/onboard/prepare/short")).toBeNull();
  });
  it("rejects external, staff, malformed and missing paths", () => {
    for (const path of ["https://example.com", "//example.com", "/ops", "/join/short", "/onboard/i/not-a-uuid", "/join/abcdefghijklmnop/../ops"]) {
      expect(investorEntryPath(`?next=${encodeURIComponent(path)}`)).toBeNull();
    }
    expect(investorEntryPath("")).toBeNull();
  });
});
