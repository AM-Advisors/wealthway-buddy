import { describe, expect, it } from "vitest";
import { effectiveStatus, optionFor, sendBlocked, uploadAllowed } from "./accreditation-evidence-options";

const now = Date.parse("2026-10-26T12:00:00Z");
const row = (o: Partial<{ status: string; expires_at: string; last_sent_at: string; created_at: string }> = {}) => ({
  status: "requested", expires_at: "2026-11-05T00:00:00Z", last_sent_at: "2026-10-20T00:00:00Z", created_at: "2026-10-20T00:00:00Z", send_count: 1, ...o,
});

describe("accreditation evidence options", () => {
  it("letter option uploads as a verification letter", () => {
    expect(optionFor("third_party_letter").defaultKind).toBe("verification_letter");
  });
  it("blocks a fourth open request", () => {
    expect(sendBlocked([row(), row(), row()], now)).toMatch(/up to 3/);
    expect(sendBlocked([row(), row()], now)).toBeNull();
  });
  it("expired requests do not count as open", () => {
    expect(sendBlocked([row({ expires_at: "2026-10-01T00:00:00Z" }), row(), row()], now)).toBeNull();
  });
  it("blocks a sixth send within a day", () => {
    const recent = row({ status: "canceled", last_sent_at: "2026-10-26T08:00:00Z" });
    expect(sendBlocked([recent, recent, recent, recent, recent], now)).toMatch(/today/);
  });
  it("upload link refuses expired, used and canceled requests", () => {
    expect(uploadAllowed(row({ expires_at: "2026-10-25T00:00:00Z" }), now)).toMatch(/expired/);
    expect(uploadAllowed(row({ status: "uploaded" }), now)).toMatch(/already/);
    expect(uploadAllowed(row({ status: "canceled" }), now)).toMatch(/canceled/);
    expect(uploadAllowed(null, now)).toMatch(/not valid/);
    expect(uploadAllowed(row(), now)).toBeNull();
    expect(effectiveStatus(row({ expires_at: "2026-10-25T00:00:00Z" }), now)).toBe("expired");
  });
});
