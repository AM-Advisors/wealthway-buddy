import { beforeEach, describe, expect, it, vi } from "vitest";
import { docContext, currentMerge } from "@/lib/prepared-investor.server";

const state = vi.hoisted(() => ({
  rows: {} as Record<string, Record<string, unknown>[]>,
  errors: new Set<string>(),
  filters: [] as { table: string; key: string; value: unknown }[],
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from(table: string) {
      let rows = [...(state.rows[table] ?? [])];
      const chain = {
        select: () => chain,
        eq(key: string, value: unknown) {
          state.filters.push({ table, key, value });
          rows = rows.filter((row) => row[key] === value);
          return chain;
        },
        in(key: string, values: unknown[]) {
          rows = rows.filter((row) => values.includes(row[key]));
          return chain;
        },
        order: () => chain,
        maybeSingle: async () => ({ data: rows[0] ?? null, error: state.errors.has(table) ? { message: "unavailable" } : null }),
        single: async () => ({ data: rows[0] ?? null, error: state.errors.has(table) ? { message: "unavailable" } : null }),
        then(resolve: (value: unknown) => unknown) {
          return Promise.resolve({ data: rows, error: state.errors.has(table) ? { message: "unavailable" } : null }).then(resolve);
        },
      };
      return chain;
    },
  },
}));

beforeEach(() => {
  state.filters = [];
  state.errors.clear();
  state.rows = {
    investor_onboardings: [{ id: "investment", offering_id: "fund", investor_user_id: "kim-login", invitation_id: null, requested_amount_cents: 10000000, application_id: "app", investment_profile_id: "trust", person_id: "kim", offering_class_key: null }],
    investor_prep_drafts: [],
    offerings: [{ id: "fund", name: "Test Fund", legal_entity_name: "Test Fund LLC" }],
    investment_profiles: [{ id: "trust", profile_type: "trust", legal_name: "Fictional Family Trust", person_id: "kim" }],
    persons: [{ id: "kim", legal_first_name: "Kimberly", legal_last_name: "Example" }],
    profiles: [{ user_id: "kim-login", legal_name: "Different Login Label", email: "kim@example.invalid" }],
    offering_documents: [{ id: "doc", offering_id: "fund", title: "Subscription", requires_signature: true, signing_mode: "investor_only", investor_required: true }],
    investment_profile_relationships: [
      { profile_id: "trust", person_id: "joe", role: "trustee", status: "active", is_authorized_signer: true, persons: { legal_first_name: "Joseph", legal_last_name: "Example" } },
      { profile_id: "other-trust", person_id: "kim", role: "trustee", status: "active", is_authorized_signer: true, persons: { legal_first_name: "Wrong", legal_last_name: "Trust" } },
      { profile_id: "trust", person_id: "kim", role: "trustee", status: "active", is_authorized_signer: true, persons: { legal_first_name: "Kimberly", legal_last_name: "Example" } },
    ],
  };
});

describe("recorded trustee details in signing preparation", () => {
  it("uses the exact investing trustee alongside the trust legal name, not the login or another trustee", async () => {
    const context = await docContext("kim-login", "investment");
    const merged = await currentMerge(context, { requires_signature: true, signing_mode: "investor_only" });
    expect(merged.values["investor_legal_name"]).toBe("Fictional Family Trust");
    expect(merged.values["signer_name"]).toBe("Kimberly Example");
    expect(merged.values["signer_title"]).toBe("Trustee");
    expect(merged.missing).toEqual([]);
    expect(state.filters).toContainEqual({ table: "investment_profile_relationships", key: "profile_id", value: "trust" });
    expect(state.filters).toContainEqual({ table: "investment_profile_relationships", key: "person_id", value: "kim" });
  });

  it.each(["removed", "not-authorized", "not-trustee"])("never fills signer facts from a %s relationship", async (caseName) => {
    const row = state.rows["investment_profile_relationships"]?.find((r) => r["profile_id"] === "trust" && r["person_id"] === "kim");
    if (!row) throw new Error("Missing fixture relationship");
    if (caseName === "removed") row["status"] = "removed";
    if (caseName === "not-authorized") row["is_authorized_signer"] = false;
    if (caseName === "not-trustee") row["role"] = "beneficial_owner";
    const context = await docContext("kim-login", "investment");
    const merged = await currentMerge(context, { requires_signature: true, signing_mode: "investor_only" });
    expect(merged.values["signer_name"]).toBe("");
    expect(merged.missing.map((item) => item.field)).toEqual(["signer_name", "signer_title"]);
  });

  it("fails closed when recorded trustee details cannot be read", async () => {
    state.errors.add("investment_profile_relationships");
    await expect(docContext("kim-login", "investment")).rejects.toThrow("trustee details");
  });

  it("retains the exact-investment owner check", async () => {
    await expect(docContext("joe-login", "investment")).rejects.toThrow("isn't available");
  });
});