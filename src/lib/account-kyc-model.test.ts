import { describe, expect, it } from "vitest";
import { gateOpen, resolveGate } from "./account-kyc-model";

describe("account identity gate", () => {
  it("exempts staff", () => expect(resolveGate({ roles: ["compliance"], grandfathered: false, latest: null })).toBe("exempt"));
  it("counts an approved fund KYC", () => expect(resolveGate({ roles: ["fund_manager"], grandfathered: true, latest: null })).toBe("approved"));
  it("blocks while in review", () => { const s = resolveGate({ roles: ["investor"], grandfathered: false, latest: "review" }); expect(s).toBe("review"); expect(gateOpen(s)).toBe(false); });
  it("lets declined and expired retry", () => { expect(resolveGate({ roles: [], grandfathered: false, latest: "declined" })).toBe("retry"); expect(resolveGate({ roles: [], grandfathered: false, latest: "expired" })).toBe("retry"); });
  it("starts new accounts", () => expect(resolveGate({ roles: ["client_gp"], grandfathered: false, latest: null })).toBe("start"));
});
