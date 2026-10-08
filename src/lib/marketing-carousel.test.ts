import { describe, expect, it } from "vitest";
import { postProblems } from "@/lib/marketing-model";

describe("carousel image limit", () => {
  const base = { title: "T", body: "Body", channels: ["instagram"] };
  it("allows up to 10 images", () => expect(postProblems({ ...base, imageCount: 10 })).toEqual([]));
  it("refuses more than 10", () => expect(postProblems({ ...base, imageCount: 11 }).join(" ")).toMatch(/at most 10/));
});
