import { describe, expect, it } from "vitest";
import { allowedInboxChannels, sendsOnboardingEmail } from "./inbox-policy";

describe("inbox channels by service level", () => {
  it("Self Serve clients only reach Operations", () => {
    expect(allowedInboxChannels(["self_serve"])).toEqual(["operations", "direct"]);
    expect(allowedInboxChannels([])).toEqual(["operations", "direct"]);
  });
  it("a client with any paid fund can reach Sales and its rep", () => {
    expect(allowedInboxChannels(["self_serve", "core"])).toContain("sales");
    expect(allowedInboxChannels(["plus"])).toContain("rep");
  });
});

describe("onboarding email", () => {
  it("sends only for an active paid level", () => {
    expect(sendsOnboardingEmail("core", "active")).toBe(true);
    expect(sendsOnboardingEmail("self_serve", "active")).toBe(false);
    expect(sendsOnboardingEmail("self_serve", "awaiting_payment")).toBe(false);
  });
});
