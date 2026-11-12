import { describe, expect, it } from "vitest";
import { DECISION_IN_PROGRESS, decisionLockKey, withDecisionLock, type RpcClient } from "@/lib/decision-lock.server";

/** In-memory stand-in for the service-role mutex RPCs. */
function fakeLocks() {
  const held = new Map<string, string>();
  const db: RpcClient = {
    rpc: async (fn, args) => {
      const key = String(args["_key"]), token = String(args["_token"]);
      if (fn === "acquire_person_creation_lock") { if (held.has(key)) return { data: false, error: null }; held.set(key, token); return { data: true, error: null }; }
      if (held.get(key) === token) held.delete(key);
      return { data: null, error: null };
    },
  };
  return { db, held };
}

describe("one decision per record", () => {
  it("a second decision on the same record while one is saving is refused and applies nothing", async () => {
    const { db } = fakeLocks();
    let applied = 0;
    let release!: () => void;
    const first = withDecisionLock(db, "fund_manager_submission", "s1", () => new Promise<void>((r) => { applied++; release = r; }));
    await expect(withDecisionLock(db, "fund_manager_submission", "s1", async () => { applied++; })).rejects.toThrow(DECISION_IN_PROGRESS);
    release();
    await first;
    expect(applied).toBe(1);
  });

  it("different records and different engines never block each other", async () => {
    const { db } = fakeLocks();
    let release!: () => void;
    const first = withDecisionLock(db, "fund_manager_submission", "s1", () => new Promise<void>((r) => { release = r; }));
    await expect(withDecisionLock(db, "fund_manager_submission", "s2", async () => "ok")).resolves.toBe("ok");
    await expect(withDecisionLock(db, "foundation_submission", "s1", async () => "ok")).resolves.toBe("ok");
    release();
    await first;
  });

  it("the lock is released after a refused or failed decision", async () => {
    const { db, held } = fakeLocks();
    await expect(withDecisionLock(db, "foundation_document", "d1", async () => { throw new Error("already reviewed"); })).rejects.toThrow("already reviewed");
    expect(held.has(decisionLockKey("foundation_document", "d1"))).toBe(false);
  });
});
