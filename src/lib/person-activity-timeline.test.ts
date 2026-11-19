import { describe, expect, it } from "vitest";
import { attachClicksToSessions, outsideAccountEvents } from "./person-activity-timeline";

const sec = (id: string, at: string, sid: string | null) => ({ id, event_type: "sign_in", action: null, path: "/auth", session_id: sid, created_at: at });

describe("attachClicksToSessions", () => {
  it("puts each click in the sign-in session it happened during", () => {
    const rows = attachClicksToSessions(
      [sec("a", "2026-11-01T10:00:00Z", "s1"), sec("b", "2026-11-02T10:00:00Z", "s2")],
      [{ id: "c1", kind: "click", path: "/home", label: "Continue", created_at: "2026-11-01T10:05:00Z" }, { id: "c2", kind: "page", path: "/sign", label: "Sign", created_at: "2026-11-02T11:00:00Z" }],
    );
    expect(rows.find((r) => r.id === "activity:c1")?.session_id).toBe("s1");
    expect(rows.find((r) => r.id === "activity:c2")?.session_id).toBe("s2");
    expect(rows.find((r) => r.id === "activity:c1")?.action).toBe("Clicked: Continue");
  });
  it("keeps clicks with no earlier sign-in, unassigned", () => {
    const rows = attachClicksToSessions([], [{ id: "c1", kind: "click", path: "/x", label: "Go", created_at: "2026-11-01T10:00:00Z" }]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.session_id).toBeNull();
  });
});

describe("outsideAccountEvents", () => {
  it("lists emails and invitation opens newest first", () => {
    const rows = outsideAccountEvents({
      sends: [{ id: "1", subject: "Your invitation", at: "2026-11-01T09:00:00Z" }],
      opens: [{ id: "2", template: "investor-invitation", at: "2026-11-01T09:30:00Z" }],
      linkOpens: [{ id: "3", at: "2026-11-01T09:31:00Z" }],
    });
    expect(rows.map((r) => r.what)).toEqual(["Opened their invitation link", "Email opened: investor invitation", "Email sent: Your invitation"]);
  });
});

describe("clicks carry their session's IP", () => {
  it("copies the sign-in IP onto clicks in that session", () => {
    const rows = attachClicksToSessions(
      [{ ...sec("a", "2026-11-01T10:00:00Z", "s1"), ip: "8.8.8.8", city: "Miami" }],
      [{ id: "c1", kind: "click", path: "/home", label: "Go", created_at: "2026-11-01T10:05:00Z" }],
    );
    expect(rows.find((r) => r.id === "activity:c1")?.ip).toBe("8.8.8.8");
    expect(rows.find((r) => r.id === "activity:c1")?.city).toBe("Miami");
  });
});
