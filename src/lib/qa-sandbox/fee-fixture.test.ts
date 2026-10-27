import { describe, expect, it } from "vitest";
import { createQaState, handleQaServerCall, QaBlockedError } from "./mock-server";
import { QA_FEE_ID } from "./fee-fixture";
const input = { lineId: QA_FEE_ID, entryDate: "2026-10-15", category: "administration" };
describe("fictional fee preview isolation", () => {
  it("returns the real preview model's balanced fictional result without changing mock records", () => {
    const state = createQaState("staff"); const before = structuredClone(state);
    const result = handleQaServerCall("previewInvoiceFeeEntry", input, state) as { ready: boolean; lines: { debitCents: number; creditCents: number }[] };
    expect(result.ready).toBe(true);
    expect(result.lines.map(l => [l.debitCents, l.creditCents])).toEqual([[1200000, 0], [0, 1200000]]);
    expect(state).toEqual(before);
  });
  it("refuses any real or unmodeled fee id", () => expect(() => handleQaServerCall("previewInvoiceFeeEntry", { ...input, lineId: "anything-else" }, createQaState())).toThrow(QaBlockedError));
  it("keeps accounting authority with staff", () => expect(() => handleQaServerCall("previewInvoiceFeeEntry", input, createQaState("manager"))).toThrow("authority"));
  it("blocks posting and draft creation rather than forwarding them", () => expect(() => handleQaServerCall("draftJournalEntry", input, createQaState())).toThrow(QaBlockedError));
});