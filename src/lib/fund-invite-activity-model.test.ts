import { describe, expect, it } from "vitest";
import { inviteActivity, linkOnlyLabel } from "@/lib/fund-invite-activity-model";

const now = new Date("2026-11-18T18:00:00Z");
const base = { hasEmail: true, invitedAt: [], openedAt: [], startedAt: [], verificationFinishedAt: null };

describe("invited investor activity", () => {
  it("someone added but never invited shows as not invited and needs follow-up", () => {
    const a = inviteActivity(base, now);
    expect(a.level).toBe("not_invited");
    expect(a.followUpReason).toBe("Not invited yet");
  });
  it("someone without an email needs one before inviting, even after finishing their identity check", () => {
    expect(inviteActivity({ ...base, hasEmail: false }, now).followUpReason).toBe("Add their email so you can invite them");
    expect(inviteActivity({ ...base, hasEmail: false, verificationFinishedAt: "2026-11-01T00:00:00Z" }, now).followUpReason).toBe("Add their email so you can invite them");
  });
  it("finished the link's check with an email but never invited and no login needs an invitation", () => {
    expect(inviteActivity({ ...base, verificationFinishedAt: "2026-11-01T00:00:00Z" }, now).followUpReason).toBe("Invite them to continue");
    expect(inviteActivity({ ...base, hasAccount: true, verificationFinishedAt: "2026-11-01T00:00:00Z" }, now).followUp).toBe(false);
  });
  it("invited 3 or more days ago with no click needs a nudge, 2 days does not", () => {
    expect(inviteActivity({ ...base, invitedAt: ["2026-11-15T17:00:00Z"] }, now).followUpReason).toBe("No click 3 days after the invitation");
    expect(inviteActivity({ ...base, invitedAt: ["2026-11-16T19:00:00Z"] }, now).followUp).toBe(false);
  });
  it("a click moves them to clicked, and 7 quiet days after that needs a nudge", () => {
    const a = inviteActivity({ ...base, invitedAt: ["2026-11-01T00:00:00Z"], openedAt: ["2026-11-10T00:00:00Z"] }, now);
    expect(a.level).toBe("opened");
    expect(a.followUpReason).toBe("No activity for 8 days");
  });
  it("finished identity check wins over everything else", () => {
    expect(inviteActivity({ ...base, startedAt: ["2026-11-17T00:00:00Z"], verificationFinishedAt: "2026-11-18T00:00:00Z" }, now).level).toBe("verified");
  });
  it("link-only people never show screening outcomes", () => {
    expect(linkOnlyLabel("Declined")).toBe("Finished identity check, not added yet");
    expect(linkOnlyLabel("Approved")).toBe("Finished identity check, not added yet");
    expect(linkOnlyLabel("Not Started")).toBe("Opened the link");
  });
});
