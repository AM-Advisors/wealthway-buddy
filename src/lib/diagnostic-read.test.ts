import { describe, expect, it } from "vitest";
import { assertDiagnosticReads, webhookProcessingState } from "./diagnostic-read";
describe("diagnostic failures and processing facts", () => {
  it("rejects a failed source even when other sources are empty successes", () => {
    expect(() => assertDiagnosticReads([{ error: null }, { error: { message: "private backend detail" } }])).toThrow("could not be loaded");
    expect(() => assertDiagnosticReads([{ error: null }])).not.toThrow();
  });
  it("does not label a received event as processed", () => {
    expect(webhookProcessingState({ processedAt: null })).toBe("Received: processing unconfirmed");
  });
  it("a timestamp does not override a recorded error", () => {
    expect(webhookProcessingState({ processedAt: "2026-10-21T12:00:00Z", error: "failed to apply" })).toBe("Processing failed");
    expect(webhookProcessingState({ processedAt: null, status: "processing_failed" })).toBe("Processing failed");
  });
  it("distinguishes successful processing from ignored or unmatched events", () => {
    expect(webhookProcessingState({ processedAt: "2026-10-21T12:00:00Z", status: "processed" })).toBe("Successfully processed");
    expect(webhookProcessingState({ processedAt: "2026-10-21T12:00:00Z", status: "unknown_item" })).toBe("Processed: no change applied");
  });
});