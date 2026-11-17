import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ tables: {} as Record<string, any[]> }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {
  auth: { admin: { getUserById: async (id: string) => ({ data: { user: (mock.tables["auth"] ?? []).find((u) => u.id === id) ?? null } }) } },
  from: (table: string) => {
    const filters: ((row: any) => boolean)[] = [];
    const q: any = {
      select: () => q, eq: (key: string, value: unknown) => { filters.push((r) => r[key] === value); return q; },
      in: (key: string, values: unknown[]) => { filters.push((r) => values.includes(r[key])); return q; },
      or: (clause: string) => { const parts = clause.split(/,(?=(?:user_id|email)\.)/); filters.push((r) => parts.some((part) => { const m = part.match(/^(user_id|email)\.in\.\((.*)\)$/); if (!m || !m[1]) return false; const vals = m[2] ? m[2].split(",") : []; return vals.includes(String(r[m[1]] ?? "")); })); return q; },
      order: () => q,
      maybeSingle: async () => ({ data: (mock.tables[table] ?? []).filter((r) => filters.every((f) => f(r)))[0] ?? null }),
      then: (resolve: any) => Promise.resolve({ data: (mock.tables[table] ?? []).filter((r) => filters.every((f) => f(r))) }).then(resolve),
    };
    return q;
  },
} }));

import { accountName, loadAccountLabels, loadAccountNames } from "./profile-name.server";

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

describe("loadAccountLabels", () => {
  const STAFF = "11111111-1111-4111-8111-111111111111";
  const NO_PROFILE = "22222222-2222-4222-8222-222222222222";
  const AUTH_ONLY = "33333333-3333-4333-8333-333333333333";
  const EMAIL_ONLY = "44444444-4444-4444-8444-444444444444";
  const NOTHING = "55555555-5555-4555-8555-555555555555";
  beforeEach(() => {
    mock.tables = {
      profiles: [
        { user_id: STAFF, legal_name: "Jenner Smith", email: "jenner@test.dev" },
        { user_id: EMAIL_ONLY, legal_name: null, email: "emailonly@test.dev" },
      ],
      persons: [{ user_id: NO_PROFILE, email: "buckman@test.dev", legal_first_name: "Ann", legal_last_name: "Buckman" }],
      auth: [{ id: AUTH_ONLY, email: "authonly@test.dev", user_metadata: { full_name: "Auth Person" } }],
    };
  });

  it("names a person who has no profile row from their person record", async () => {
    expect((await loadAccountLabels([NO_PROFILE])).get(NO_PROFILE)).toBe("Ann Buckman");
  });

  it("keeps the profile name for staff", async () => {
    expect((await loadAccountLabels([STAFF])).get(STAFF)).toBe("Jenner Smith");
  });

  it("uses the account email when no name is recorded", async () => {
    expect((await loadAccountLabels([EMAIL_ONLY])).get(EMAIL_ONLY)).toBe("emailonly@test.dev");
  });

  it("falls back to the sign-in record when no profile or person exists", async () => {
    expect((await loadAccountLabels([AUTH_ONLY])).get(AUTH_ONLY)).toBe("Auth Person");
  });

  it("leaves accounts with nothing on file unresolved", async () => {
    expect((await loadAccountLabels([NOTHING])).has(NOTHING)).toBe(false);
  });
});
