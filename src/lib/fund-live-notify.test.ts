import { describe, expect, it } from "vitest";
import { fundLiveKey, fundLiveRecipients } from "./fund-live-notify.server";

describe("fund live email", () => {
  it("emails each fund team member once and skips people without email", () => {
    const r = fundLiveRecipients([
      { user_id: "a", email: "Thomas@x.com", legal_name: "Thomas" },
      { user_id: "a2", email: "thomas@x.com" },
      { user_id: "b", email: null },
      { user_id: "c", email: "team@x.com" },
    ]);
    expect(r.map((x) => x.email)).toEqual(["thomas@x.com", "team@x.com"]);
  });
  it("uses one stable key per launch and person so relaunch does not resend", () => {
    expect(fundLiveKey("s1", "u1")).toBe("fund-live-s1-u1");
  });
});
