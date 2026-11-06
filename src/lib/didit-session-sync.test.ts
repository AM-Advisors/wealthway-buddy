import { describe, expect, it } from "vitest";
import { extractDiditDetails } from "./didit-auto-apply.server";

const session = (hits: any[], status = "Approved") => ({ status, id_verifications: [{ status: "Approved" }], aml_screenings: [{ status: "Approved", total_hits: hits.length, hits }] });

describe("approved verification session applies to manual records", () => {
  it("approved session whose matches the provider ruled out gives approved screening", () => {
    expect(extractDiditDetails(session([{ caption: "Kevin G Sykes", match: false }, { caption: "Kevin Sikes", review_status: "False Positive" }])).amlStatus).toBe("approved");
  });
  it("an unresolved match keeps screening in review", () => {
    expect(extractDiditDetails(session([{ caption: "Someone", match: true, review_status: "Unreviewed" }])).amlStatus).toBe("review");
  });
});
