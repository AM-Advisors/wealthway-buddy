import { describe, expect, it } from "vitest";
import { personIdentityAction } from "@/lib/person-identity-model";

describe("one identity check per person", () => {
  it("a passed login check is reused, never a new session", () => {
    expect(personIdentityAction({ status: "approved", sessionUrl: "https://x" }).kind).toBe("reuse");
  });
  it("a login check under review means wait, with no new link", () => {
    expect(personIdentityAction({ status: "review", sessionUrl: "https://x" })).toEqual({ kind: "wait" });
  });
  it("an unfinished login check reopens the same link", () => {
    expect(personIdentityAction({ status: "pending", sessionUrl: "https://same" })).toEqual({ kind: "resume", url: "https://same" });
  });
  it("a sent-back check gets one recovery start", () => {
    expect(personIdentityAction({ status: "sent_back", sessionUrl: null }).kind).toBe("start");
  });
  it("a declined check is not restarted by the investor", () => {
    expect(personIdentityAction({ status: "declined", sessionUrl: null }).kind).toBe("blocked");
  });
});
