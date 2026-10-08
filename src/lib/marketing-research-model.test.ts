import { describe, expect, it } from "vitest";
import { checkClaims, dedupeKey, heuristicRelevance, opportunityScore, shouldAlert, timelinessScore } from "./marketing-research-model";

describe("research scoring", () => {
  it("uses the 25/20/20/15/15/5 weights", () => {
    expect(opportunityScore({ relevance: 100, timeliness: 0, seo: 0, engagement: 0, credibility: 0, commercial: 0 })).toBe(25);
    expect(opportunityScore({ relevance: 0, timeliness: 100, seo: 100, engagement: 0, credibility: 0, commercial: 0 })).toBe(40);
    expect(opportunityScore({ relevance: 0, timeliness: 0, seo: 0, engagement: 100, credibility: 100, commercial: 100 })).toBe(35);
    expect(opportunityScore({ relevance: 100, timeliness: 100, seo: 100, engagement: 100, credibility: 100, commercial: 100 })).toBe(100);
  });
  it("decays timeliness", () => {
    const now = new Date("2026-10-08T12:00:00Z");
    expect(timelinessScore("2026-10-08T12:00:00Z", now)).toBe(100);
    expect(timelinessScore("2026-10-05T12:00:00Z", now)).toBe(50);
    expect(timelinessScore("2026-08-01T00:00:00Z", now)).toBe(0);
    expect(timelinessScore(null, now)).toBe(0);
  });
  it("dedupes tracking params and www", () => {
    expect(dedupeKey("https://www.sec.gov/news/press-release/2026-1?utm_source=x#top")).toBe(dedupeKey("https://sec.gov/news/press-release/2026-1/"));
  });
  it("finds fund keywords", () => {
    expect(heuristicRelevance("SEC amends Form D for private funds").keywords).toEqual(expect.arrayContaining(["form d", "private funds"]));
  });
});

describe("claims", () => {
  const stories = [
    { id: "p", url: "https://sec.gov/a", primary_source_urls: ["https://sec.gov/a"], verification_status: "verified_primary" },
    { id: "r", url: "https://news.example/b", primary_source_urls: [], verification_status: "reported" },
  ];
  it("labels facts by their source and blocks unsourced facts", () => {
    const { claims, unverified } = checkClaims([
      { text: "SEC adopted X", kind: "fact", story_id: "p" },
      { text: "Reported Y", kind: "fact", story_id: "r" },
      { text: "Invented Z", kind: "fact", story_id: "nope" },
      { text: "We think W", kind: "opinion" },
    ], stories);
    expect(claims.map((c) => c.verification)).toEqual(["verified_primary", "reported", "unverified", "not_applicable"]);
    expect(unverified).toBe(1);
  });
  it("alerts but never publishes", () => {
    expect(shouldAlert({ score: 80, regulatory_sensitivity: "high", timeliness: 50 })).toBeTruthy();
    expect(shouldAlert({ score: 60, regulatory_sensitivity: "high", timeliness: 100 })).toBeNull();
  });
});
