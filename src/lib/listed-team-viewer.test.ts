import { describe, expect, it } from "vitest";
import { listedTeamViewerRole } from "./fund-team-access";
import { buildMyFunds } from "./client-portal-model";

const me = "user-1";
const fund = { id: "f1", name: "Corps LaaSy", fund_type: "spv", entity_type: null, is_open: false, client_name: "Corps Capital Advisors" };

describe("listed fund team members see their fund", () => {
  it("a linked team entry with view access is a Viewer", () => {
    expect(listedTeamViewerRole({ user_id: me, removed_at: null, permissions: ["view", "investors"] }, me)).toBe("fund_viewer");
  });
  it("removed entries, someone else's entry, or no view permission give nothing", () => {
    expect(listedTeamViewerRole({ user_id: me, removed_at: "2026-11-01", permissions: ["view"] }, me)).toBeNull();
    expect(listedTeamViewerRole({ user_id: "other", removed_at: null, permissions: ["view"] }, me)).toBeNull();
    expect(listedTeamViewerRole({ user_id: me, removed_at: null, permissions: ["investors"] }, me)).toBeNull();
  });
  it("My Funds lists a team-only fund as view only, opening the shared fund view", () => {
    const [row] = buildMyFunds({ managedFundIds: [], investorFundIds: [], teamFundIds: ["f1"] }, [fund]);
    expect(row?.relationshipLabel).toBe("Fund team");
    expect(row?.path).toBe("/shared-funds");
    expect(row?.search).toEqual({ fund: "f1" });
    expect(row?.outstandingActions).toBeNull();
  });
});
