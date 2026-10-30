import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ tables: {} as Record<string, any[]> }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  from: (table: string) => {
    const filters: ((row: any) => boolean)[] = [];
    const q: any = {
      select: () => q, eq: (key: string, value: unknown) => { filters.push((r) => r[key] === value); return q; },
      in: (key: string, values: unknown[]) => { filters.push((r) => values.includes(r[key])); return q; },
      or: (clause: string) => { const parts = clause.split(/,(?=(?:user_id|email)\.)/); filters.push((r) => parts.some((part) => { const m = part.match(/^(user_id|email)\.in\.\((.*)\)$/); if (!m) return false; const vals = m[2] ? m[2].split(",") : []; return vals.includes(String(r[m[1]] ?? "")); })); return q; },
      order: () => q,
      maybeSingle: async () => ({ data: (mock.tables[table] ?? []).filter((r) => filters.every((f) => f(r)))[0] ?? null }),
      then: (resolve: any) => Promise.resolve({ data: (mock.tables[table] ?? []).filter((r) => filters.every((f) => f(r))) }).then(resolve),
    };
    return q;
  },
} }));

import { accountName, loadAccountNames } from "./profile-name.server";

describe("loadAccountNames", () => {
  beforeEach(() => {
    mock.tables = {
      profiles: [
        { user_id: "u-profile-name", legal_name: "Profile Name", email: "p@test.dev" },
        { user_id: "u-profile-blank", legal_name: null, email: "blank@test.dev" },
        { user_id: "u-email-match", legal_name: null, email: "linked@test.dev" },
        { user_id: "u-unknown", legal_name: null, email: "nobody@test.dev" },
      ],
      persons: [
        { user_id: "u-profile-blank", email: "blank@test.dev", legal_first_name: "Doug", legal_last_name: "Mangrum" },
        { user_id: null, email: "linked@test.dev", legal_first_name: "Kimberly", legal_last_name: "Girardi" },
      ],
    };
  });

  it("prefers the profile legal name", async () => {
    const names = await loadAccountNames(["u-profile-name"]);
    expect(names.get("u-profile-name")).toBe("Profile Name");
  });

  it("falls back to the linked person's name when the profile has none", async () => {
    const names = await loadAccountNames(["u-profile-blank"]);
    expect(names.get("u-profile-blank")).toBe("Doug Mangrum");
  });

  it("falls back to a person matched by email", async () => {
    const names = await loadAccountNames(["u-email-match"]);
    expect(names.get("u-email-match")).toBe("Kimberly Girardi");
  });

  it("never invents a name when nothing is linked", async () => {
    const names = await loadAccountNames(["u-unknown"]);
    expect(names.has("u-unknown")).toBe(false);
  });

  it("resolves a single account name", async () => {
    expect(await accountName("u-profile-blank")).toBe("Doug Mangrum");
    expect(await accountName("u-unknown")).toBeNull();
  });
});
