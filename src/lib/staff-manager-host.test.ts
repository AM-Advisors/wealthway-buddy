import { describe, expect, it } from "vitest";
import { canonicalRedirect, redirectSettles } from "@/lib/host-routing";

const APP = "https://app.harmonious.co";
const OPS = "https://ops.harmonious.co";

describe("staff opening fund-manager screens from Operations", () => {
  it("stays on the Operations address so the staff sign-in is kept", () => {
    expect(canonicalRedirect({ url: `${OPS}/manager/fund/abc/investors` })).toBeNull();
    expect(canonicalRedirect({ url: `${OPS}/manager` })).toBeNull();
    expect(redirectSettles(`${OPS}/manager/fund/abc`)).toBe(true);
  });
  it("leaves client addresses unchanged", () => {
    expect(canonicalRedirect({ url: `${APP}/manager/fund/abc` })).toBeNull();
    expect(canonicalRedirect({ url: `${OPS}/my-funds` })?.location).toBe(`${APP}/my-funds`);
    expect(canonicalRedirect({ url: `${OPS}/manager-login` })).toBeNull();
  });
});
