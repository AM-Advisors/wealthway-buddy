import { describe, expect, it } from "vitest";
import { sowStage } from "./sow-stage";

describe("sowStage", () => {
  it("draft until sent", () => expect(sowStage({ status: "draft", client_status: "pending", approval_status: "pending" })).toBe("draft"));
  it("proposed when out with client", () => expect(sowStage({ status: "active", client_status: "pending", approval_status: "pending" })).toBe("proposed"));
  it("executed when client signed and Harmonious approved", () => expect(sowStage({ status: "active", client_status: "signed", approval_status: "approved" })).toBe("executed"));
  it("executed when executed date recorded", () => expect(sowStage({ status: "draft", executed_at: "2026-10-01" })).toBe("executed"));
});
