import { describe, expect, it } from "vitest";
import { documentReachedEnd } from "./document-review-model";

describe("document read completion", () => {
  it("accepts a complete short Word or PDF document without scrolling", () => {
    expect(documentReachedEnd({ ready: true, scrollTop: 0, clientHeight: 500, scrollHeight: 400 })).toBe(true);
  });
  it("requires reaching the end of all rendered PDF pages", () => {
    expect(documentReachedEnd({ ready: true, scrollTop: 0, clientHeight: 500, scrollHeight: 2000 })).toBe(false);
    expect(documentReachedEnd({ ready: true, scrollTop: 1500, clientHeight: 500, scrollHeight: 2000 })).toBe(true);
  });
  it("does not unlock partially rendered or failed content", () => {
    expect(documentReachedEnd({ ready: false, scrollTop: 1500, clientHeight: 500, scrollHeight: 2000 })).toBe(false);
    expect(documentReachedEnd({ ready: true, scrollTop: 0, clientHeight: 0, scrollHeight: 0 })).toBe(false);
  });
});