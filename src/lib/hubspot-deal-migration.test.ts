import { describe, expect, it } from "vitest";
import { defaultStageFor, editedInHarmonious, parseAmount, reconcileLine, reconciled, snippet } from "@/lib/hubspot-deal-migration";

const st = (o: Partial<Parameters<typeof defaultStageFor>[0]>) => ({ pipelineId: "p", stageId: "s", isClosed: false, probability: 0.2, label: "x", ...o });

describe("HubSpot deal migration rules", () => {
  it("maps closed stages to won/lost and open stages by probability", () => {
    expect(defaultStageFor(st({ isClosed: true, probability: 1, label: "Closed Won" }))).toBe("won");
    expect(defaultStageFor(st({ isClosed: true, probability: 0, label: "Closed Lost" }))).toBe("lost");
    expect(defaultStageFor(st({ probability: 0.05 }))).toBe("lead");
    expect(defaultStageFor(st({ probability: 0.35 }))).toBe("meeting");
    expect(defaultStageFor(st({ probability: 0.75 }))).toBe("proposal");
    expect(defaultStageFor(st({ probability: 0.9 }))).toBe("committed");
  });
  it("validates amounts without discarding the raw value", () => {
    expect(parseAmount("2500")).toEqual({ cents: 250000 });
    expect(parseAmount("1,234.56")).toEqual({ cents: 123456 });
    expect(parseAmount("")).toEqual({ cents: null });
    expect(parseAmount("abc").issue).toBeTruthy();
    expect(parseAmount("-5").issue).toBeTruthy();
  });
  it("detects Harmonious-side edits after the last import", () => {
    expect(editedInHarmonious({ updated_at: "2026-10-13T00:00:10Z", last_imported_at: "2026-10-13T00:00:00Z" })).toBe(true);
    expect(editedInHarmonious({ updated_at: "2026-10-13T00:00:01Z", last_imported_at: "2026-10-13T00:00:00Z" })).toBe(false);
    expect(editedInHarmonious({ updated_at: "2026-10-13T00:00:10Z", last_imported_at: null })).toBe(false);
  });
  it("reconciliation passes only when every line matches", () => {
    expect(reconciled([reconcileLine("a", 3, 3), reconcileLine("b", 1, 1)])).toBe(true);
    expect(reconciled([reconcileLine("a", 3, 2)])).toBe(false);
    expect(reconciled([])).toBe(false);
  });
  it("strips HTML from snippets", () => {
    expect(snippet("<p>Hello&nbsp;<b>there</b></p>")).toBe("Hello there");
  });
});
