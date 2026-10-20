import { describe, expect, it } from "vitest";

import { clientAccessIds } from "@/lib/client-membership";

/** Fake supabase returning fixed client_users and fund_managers rows. */
function fakeSupabase(links: any[], managed: any[]) {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: () =>
          Promise.resolve({
            data: table === "client_users" ? links : table === "fund_managers" ? managed : [],
          }),
      }),
    }),
  } as any;
}

describe("clientAccessIds", () => {
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
