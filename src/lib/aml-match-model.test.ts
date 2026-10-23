import { describe, expect, it } from "vitest";
import { compareHit, unclearedHits, type MatchHit } from "./aml-match-model";

const hit = (o: Partial<MatchHit>): MatchHit => ({ caption: "Jane Doe", datasets: ["sanctions"], countries: [], birthDates: [], matchScore: 90, pep: false, lists: [], summary: null, ...o });
const person = { fullName: "Jane Doe", dateOfBirth: "1985-04-12", country: "United States" };

describe("watchlist match comparison", () => {
  it("suggests a different person when the birth year differs", () => expect(compareHit(person, hit({ birthDates: ["1962"] })).suggestion).toBe("likely_different_person"));
  it("needs a close look when the birth date matches", () => expect(compareHit(person, hit({ birthDates: ["1985-04-12"] })).suggestion).toBe("needs_close_look"));
  it("needs a close look when there is no birth date", () => expect(compareHit(person, hit({})).birth).toBe("unknown"));
  it("never suggests clearing a politically exposed person automatically", () => expect(compareHit(person, hit({ birthDates: ["1962"], pep: true })).suggestion).toBe("needs_close_look"));
  it("flags country differences", () => expect(compareHit(person, hit({ countries: ["ru"] })).country).toBe("differs"));
  it("lists matches not yet cleared", () => {
    const hits = [hit({ id: "a" }), hit({ id: "b" })];
    expect(unclearedHits(hits, ["id:a"])).toEqual(["id:b"]);
  });
});
