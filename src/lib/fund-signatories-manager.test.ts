import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ writes: [] as string[] }));
vi.mock("@/lib/fund-setup.server", () => ({
  setupActor: async () => ({ isStaff: false, offeringIds: ["fund-a"] }),
  forbid: (message: string) => { throw new Error(`Forbidden: ${message}`); },
}));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from: (table: string) => {
    const q: any = {
      select: () => q, eq: () => q,
      maybeSingle: async () => ({ data: table === "offerings" ? { client_id: "client-a" } : { id: "contact-a", client_id: "client-a", person_id: null } }),
      update: () => { state.writes.push(table); return q; },
      insert: () => { state.writes.push(table); return q; },
    };
    return q;
  },
} }));
vi.mock("@/lib/person-resolution.server", () => ({ resolvePersonServer: vi.fn(), withPersonCreationLock: vi.fn() }));

import { addFundSignatory, updateFundSignatory } from "./fund-signatories.server";

describe("manager signer safeguards", () => {
  beforeEach(() => { state.writes = []; });
  it("denies an unrelated fund before writing", async () => {
    await expect(updateFundSignatory("manager", { offeringId: "fund-b", id: "signer", remove: true })).rejects.toThrow(/do not manage/);
    expect(state.writes).toEqual([]);
  });
  it("does not let managers change a person's email", async () => {
    await expect(updateFundSignatory("manager", { offeringId: "fund-a", id: "signer", email: "different@example.test" })).rejects.toThrow(/personal identity/);
    expect(state.writes).toEqual([]);
  });
  it("does not let managers create a new identity", async () => {
    await expect(addFundSignatory("manager", { offeringId: "fund-a", newPerson: { fullName: "Fictional Person" } })).rejects.toThrow(/invite the person first/);
    expect(state.writes).toEqual([]);
  });
  it("rejects an unconnected contact without linking or mutating it", async () => {
    await expect(addFundSignatory("manager", { offeringId: "fund-a", candidateKey: "contact:contact-a" })).rejects.toThrow(/connecting their identity/);
    expect(state.writes).toEqual([]);
  });
});