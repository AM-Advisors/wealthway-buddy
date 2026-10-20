import { describe, expect, it } from "vitest";
import { backupKey, clearBackup, readBackup, saveStatusText, shouldOfferRestore, writeBackup } from "./fund-request-local-backup";

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
});
