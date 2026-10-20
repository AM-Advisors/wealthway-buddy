import { describe, expect, it } from "vitest";
import { deliveryStatus } from "./investor-emails-model";

describe("deliveryStatus", () => {
  it("never reports delivered without a provider event", () => {
    expect(deliveryStatus([{ event: "request", at: "2026-10-20T15:13:00Z" }]).label).toBe("No delivery report yet");
  });
  it("reports opened over delivered", () => {
    expect(deliveryStatus([{ event: "delivered", at: "2026-10-20T15:14:00Z" }, { event: "opened", at: "2026-10-20T15:15:00Z" }]).label).toBe("Opened");
  });
  it("a bounce wins over everything", () => {
    expect(deliveryStatus([{ event: "delivered", at: "a" }, { event: "hard_bounce", at: "b", reason: "no mailbox" }]).label).toBe("Bounced");
  });
});
