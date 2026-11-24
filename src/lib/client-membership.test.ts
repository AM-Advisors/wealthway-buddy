import { describe, expect, it } from "vitest";

import { clientAccessIds } from "@/lib/client-membership";

/** Fake supabase returning fixed client_users and fund_managers rows. */
function fakeSupabase(links: any[], managed: any[]) {
  return {
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      const rows = () => (table === "client_users" ? links : table === "fund_managers" ? managed : []).filter((r: any) => Object.entries(filters).every(([k, v]) => (r[k] ?? null) === v));
      const q: any = {
        select: () => q,
        is: (k: string, v: unknown) => ((filters[k] = v), q),
        eq: () => Promise.resolve({ data: rows() }),
      };
      return q;
    },
  } as any;
}

describe("clientAccessIds", () => {
  it("reports an access lookup failure rather than treating the member as unauthorized", async () => {
    const q: any = { select: () => q, is: () => q, eq: async () => ({ data: null, error: { message: "unavailable" } }) };
    const db = { from: () => q };
    await expect(clientAccessIds(db, "u1")).rejects.toThrow("couldn't check your organization access");
  });
  it("skips a removed client membership", async () => {
    const ids = await clientAccessIds(fakeSupabase([{ client_id: "c1", revoked_at: "2026-11-01" }], []), "u1");
    expect(ids).toEqual([]);
  });
  it("returns direct client memberships", async () => {
    const ids = await clientAccessIds(fakeSupabase([{ client_id: "c1" }], []), "u1");
    expect(ids).toEqual(["c1"]);
  });

  it("includes clients reached through a managed fund", async () => {
    const ids = await clientAccessIds(
      fakeSupabase([], [{ offerings: { client_id: "c2" } }]),
      "u1",
    );
    expect(ids).toEqual(["c2"]);
  });

  it("unions and dedupes both sources", async () => {
    const ids = await clientAccessIds(
      fakeSupabase([{ client_id: "c1" }], [{ offerings: { client_id: "c1" } }, { offerings: { client_id: "c3" } }]),
      "u1",
    );
    expect(ids.sort()).toEqual(["c1", "c3"]);
  });

  it("ignores managed rows with no client", async () => {
    const ids = await clientAccessIds(fakeSupabase([], [{ offerings: null }]), "u1");
    expect(ids).toEqual([]);
  });
});
