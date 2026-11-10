import { describe, it, expect } from "vitest";
import { termsApprovalHistory, termsSummary } from "@/lib/terms-approval-history";

const classes = [
  { key: "class_a", name: "Class A", managementFee: { ratePercent: 6 }, carry: { ratePercent: 20 } },
  { key: "class_b", name: "Class B", managementFee: { ratePercent: 0 }, carry: { ratePercent: 0 }, documentedIn: ["side_letter"] },
] as any;

describe("fund terms approval history", () => {
  it("records who approved and when, newest first, with the current version marked", () => {
    const versions = [
      { id: "v1", version: 1, status: "superseded", approved_by: "u1", approved_at: "2026-11-01T10:00:00Z", terms: {}, classes },
      { id: "v2", version: 2, status: "approved", approved_by: "u2", approved_at: "2026-11-10T21:00:00Z", terms: {}, classes },
    ];
    const events = [
      { subject_id: "v2", event: "economics_approved", actor_user_id: "u2", actor_role: "client", created_at: "2026-11-10T21:00:00Z", detail: { version: 2, approver_name: "Thomas Morgan Jr" } },
      { subject_id: "v1", event: "economics_approved", actor_user_id: "u1", actor_role: "harmonious", created_at: "2026-11-01T10:00:00Z", detail: {} },
    ];
    const h = termsApprovalHistory(versions, events, new Map([["u1", { name: "Alyssa Pettit" }]]));
    expect(h.map((e) => [e.version, e.approverName, e.approverRole, e.current])).toEqual([
      [2, "Thomas Morgan Jr", "Fund team", true],
      [1, "Alyssa Pettit", "Harmonious", false],
    ]);
    expect(h[0]!.approvedAt).toBe("2026-11-10T21:00:00Z");
  });

  it("includes an approval saved on the version even without a log entry", () => {
    const h = termsApprovalHistory([{ id: "v1", version: 1, status: "approved", approved_by: "u1", approved_at: "2026-10-01T00:00:00Z", terms: {}, classes: [] }], [], new Map([["u1", { email: "a@harmonious.co" }]]));
    expect(h).toHaveLength(1);
    expect(h[0]!.approverName).toBe("a@harmonious.co");
  });

  it("summarizes the approved fee, carry and document per class", () => {
    expect(termsSummary({}, classes)).toBe("Class A: 6% fee, 20% carry · Class B: 0% fee, 0% carry, in Investor side letter");
  });
});
