import { describe, expect, it } from "vitest";
import { backupKey, carryAnswersToClient, clearBackup, draftIdForClient, readBackup, saveStatusText, shouldOfferRestore, writeBackup } from "./fund-request-local-backup";

function mem() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}

describe("fund request local backup", () => {
  it("restores answers after a refresh", () => {
    const s = mem(); const key = backupKey("c1", null);
    writeBackup(s, key, { fund_name: "Thomas SPV" });
    expect(readBackup<{ fund_name: string }>(s, key)?.request.fund_name).toBe("Thomas SPV");
  });
  it("offers restore only when backup differs from the saved draft", () => {
    const b = { savedAt: "x", request: { fund_name: "A" } };
    expect(shouldOfferRestore(b, JSON.stringify({ fund_name: "A" }))).toBe(false);
    expect(shouldOfferRestore(b, JSON.stringify({ fund_name: "" }))).toBe(true);
  });
  it("clears after a successful save", () => {
    const s = mem(); const key = backupKey("c1", "d1");
    writeBackup(s, key, { a: 1 }); clearBackup(s, key);
    expect(readBackup(s, key)).toBeNull();
  });
  it("shows a warning, not 'saved', when the last save failed", () => {
    expect(saveStatusText({ pending: false, error: "boom", savedLabel: "2:00 PM", dirty: false })).toBe("Not saved, retrying");
  });
  it("keeps a copy of answers typed before a client is chosen", () => {
    const s = mem(); const key = backupKey(null, null);
    writeBackup(s, key, { fund_name: "Darmen Debt LP" });
    expect(readBackup<{ fund_name: string }>(s, key)?.request.fund_name).toBe("Darmen Debt LP");
    expect(key).not.toBe(backupKey("c1", null));
  });
});

describe("choosing or changing the client", () => {
  const answers = { fund_name: "Darmen Debt LP", kind: "private_credit", documents: [{ path: "client/a/x.pdf" }] };
  it("keeps every answer when the client is chosen for the first time", () => {
    expect(carryAnswersToClient(answers, null, "b")).toEqual({ request: answers, removedFiles: 0 });
  });
  it("keeps every answer when the client is cleared", () => {
    expect(carryAnswersToClient(answers, "a", null).request).toEqual(answers);
  });
  it("keeps typed answers but drops files uploaded under the previous client", () => {
    const res = carryAnswersToClient(answers, "a", "b");
    expect(res.request.fund_name).toBe("Darmen Debt LP");
    expect(res.request.kind).toBe("private_credit");
    expect(res.request.documents).toEqual([]);
    expect(res.removedFiles).toBe(1);
  });
  it("starts a new draft for the new client instead of saving into the old client's draft", () => {
    expect(draftIdForClient("d1", "a", "b")).toBeNull();
    expect(draftIdForClient("d1", "a", "a")).toBe("d1");
    expect(draftIdForClient("d1", null, "a")).toBe("d1");
  });
});
