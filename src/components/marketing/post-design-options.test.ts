import { describe, expect, it } from "vitest";
import { carouselContentCount, POST_PALETTES, resizeCarouselDrafts } from "./post-design-options";

describe("post design options", () => {
  it("counts cover and closing within every selectable total", () => {
    for (let total = 3; total <= 10; total++) expect(carouselContentCount(total) + 2).toBe(total);
  });
  it("keeps totals in bounds", () => {
    expect(carouselContentCount(1)).toBe(1);
    expect(carouselContentCount(20)).toBe(8);
    expect(carouselContentCount(NaN)).toBe(2);
  });
  it("adds empty drafts without duplicating content", () => {
    const slides = [{ title: "Original", text: "Post content" }];
    const resized = resizeCarouselDrafts(slides, 10);
    expect(resized).toHaveLength(8);
    expect(resized[0]).toEqual(slides[0]);
    expect(resized[7]).toEqual({ title: "", text: "" });
  });
  it("preserves hidden drafts when decreasing the count", () => {
    const slides = Array.from({ length: 8 }, (_, i) => ({ title: `Slide ${i}`, text: "Draft" }));
    expect(resizeCarouselDrafts(slides, 3)).toEqual(slides);
  });
  it("offers seven distinct token-based palettes", () => {
    expect(new Set(POST_PALETTES.map((p) => p.id)).size).toBe(7);
    for (const p of POST_PALETTES) expect(p.surface).toMatch(/^var\(--brand-/);
  });
});