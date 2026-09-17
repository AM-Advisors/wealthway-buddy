import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Adversarial tests for Phase 2 identity, onboarding and investment profiles.
 *
 * Nothing is verified because a browser says so: KYC, AML, KYB and
 * accreditation states all come from stored records, and every id is resolved
 * server-side before an answer is given.
 */

const PERSON_A_USER = "aaaaaaaa-0000-4000-8000-000000000001";
const PERSON_B_USER = "aaaaaaaa-0000-4000-8000-000000000002";
const STAFF_USER = "aaaaaaaa-0000-4000-8000-000000000003";
const PERSON_A = "bbbbbbbb-0000-4000-8000-000000000001";
const PERSON_B = "bbbbbbbb-0000-4000-8000-000000000002";
const TRUSTEE = "bbbbbbbb-0000-4000-8000-000000000003";
const PROFILE_A_IND = "cccccccc-0000-4000-8000-000000000001";
const PROFILE_A_LLC = "cccccccc-0000-4000-8000-000000000002";
const PROFILE_A_TRUST = "cccccccc-0000-4000-8000-000000000003";
const PROFILE_B_IND = "cccccccc-0000-4000-8000-000000000004";
const OFFERING_506B = "dddddddd-0000-4000-8000-000000000001";
const OFFERING_506C = "dddddddd-0000-4000-8000-000000000002";
const OFFERING_CF = "dddddddd-0000-4000-8000-000000000003";

const DAY = 86_400_000;
const future = new Date(Date.now() + 90 * DAY).toISOString();
const past = new Date(Date.now() - 90 * DAY).toISOString();

type Row = Record<string, any>;
let tables: Record<string, Row[]>;

function seed() {
  tables = {
    user_roles: [{ user_id: STAFF_USER, role: "admin" }],
    persons: [
      {
        id: PERSON_A,
        user_id: PERSON_A_USER,
        kyc_status: "approved",
        aml_status: "approved",
        onboarding_state: "verified",
        legal_first_name: "Jane",
        legal_last_name: "Smith",
        date_of_birth: "1980-01-01",
        tax_id_reference: "123-45-6789",
        tax_id_last4: "6789",
        reverification_due_at: null,
      },
      {
        id: PERSON_B,
        user_id: PERSON_B_USER,
        kyc_status: "not_started",
        aml_status: "not_started",
        onboarding_state: "profile_required",
        legal_first_name: null,
        legal_last_name: null,
      },
      {
        id: TRUSTEE,
        user_id: null,
        kyc_status: "not_started",
        aml_status: "not_started",
        onboarding_state: "profile_required",
        legal_last_name: "Doe",
      },
    ],
    person_onboarding_events: [],
    investment_profiles: [
      { id: PROFILE_A_IND, owner_user_id: PERSON_A_USER, person_id: PERSON_A, profile_type: "individual", display_label: "Jane Smith", status: "active" },
      { id: PROFILE_A_LLC, owner_user_id: PERSON_A_USER, person_id: null, profile_type: "llc", display_label: "Smith Holdings LLC", status: "active" },
      { id: PROFILE_A_TRUST, owner_user_id: PERSON_A_USER, person_id: null, profile_type: "trust", display_label: "Smith Family Trust", status: "active" },
      { id: PROFILE_B_IND, owner_user_id: PERSON_B_USER, person_id: PERSON_B, profile_type: "individual", display_label: "Bob B", status: "active" },
    ],
    investment_profile_relationships: [
      { profile_id: PROFILE_A_LLC, person_id: PERSON_A, role: "control_person", status: "active" },
      { profile_id: PROFILE_A_TRUST, person_id: TRUSTEE, role: "trustee", status: "active" },
    ],
    entity_verifications: [
      { profile_id: PROFILE_A_LLC, kyb_status: "approved", entity_aml_status: "approved", expires_at: null },
      { profile_id: PROFILE_A_TRUST, kyb_status: "not_started", entity_aml_status: "not_started" },
    ],
    profile_accreditations: [
      { profile_id: PROFILE_A_IND, offering_id: null, status: "approved", verification_method: "self_attested", verified_at: past, expires_at: future },
      { profile_id: PROFILE_A_LLC, offering_id: null, status: "approved", verification_method: "self_attested", verified_at: past, expires_at: future },
    ],
    offerings: [
      { id: OFFERING_506B, reg_type: "506b" },
      { id: OFFERING_506C, reg_type: "506c" },
      { id: OFFERING_CF, reg_type: "regcf" },
    ],
    offering_requirements: [
      { offering_id: OFFERING_506B, accreditation_required: true, accreditation_verification: "self_attested", requires_person_kyc: true, requires_person_aml: true, requires_entity_kyb: true, requires_control_person_kyc: true },
      { offering_id: OFFERING_506C, accreditation_required: true, accreditation_verification: "third_party_verified", requires_person_kyc: true, requires_person_aml: true, requires_entity_kyb: true, requires_control_person_kyc: true },
      { offering_id: OFFERING_CF, accreditation_required: false, accreditation_verification: "self_attested", requires_person_kyc: true, requires_person_aml: true, requires_entity_kyb: false, requires_control_person_kyc: false },
    ],
    investment_profile_snapshots: [],
  };
}

/** A tiny stand-in for the query builder, over the seeded tables. */
function makeClient() {
  const build = (name: string) => {
    let rows = () => [...(tables[name] ?? [])];
    const filters: Array<(r: Row) => boolean> = [];
    let joinFilter: ((r: Row) => boolean) | null = null;

    const api: any = {
      select(sel?: string) {
        if (sel && sel.includes("persons!inner")) {
          joinFilter = () => true;
        }
        return api;
      },
      eq(col: string, val: any) {
        if (col.includes(".")) {
          const [, field] = col.split(".");
          filters.push((r) => {
            const person = (tables["persons"] ?? []).find((p) => p.id === r["person_id"]);
            return !!person && person[field] === val;
          });
          return api;
        }
        filters.push((r) => r[col] === val);
        return api;
      },
      ilike(col: string, val: string) {
        filters.push((r) => String(r[col] ?? "").toLowerCase() === val.toLowerCase());
        return api;
      },
      in(col: string, vals: any[]) {
        filters.push((r) => vals.includes(r[col]));
        return api;
      },
      order() {
        return api;
      },
      limit() {
        return api;
      },
      then(resolve: any) {
        return Promise.resolve({ data: rows().filter((r) => filters.every((f) => f(r))), error: null }).then(resolve);
      },
      maybeSingle() {
        const found = rows().filter((r) => filters.every((f) => f(r)))[0] ?? null;
        void joinFilter;
        return Promise.resolve({ data: found, error: null });
      },
      single() {
        return api.maybeSingle();
      },
      insert(values: Row | Row[]) {
        const list = Array.isArray(values) ? values : [values];
        const created = list.map((v) => ({ id: `${name}-${(tables[name] ?? []).length + 1}`, ...v }));
        tables[name] = [...(tables[name] ?? []), ...created];
        const result = { data: created[0], error: null };
        return {
          select: () => ({
            single: () => Promise.resolve(result),
            maybeSingle: () => Promise.resolve(result),
          }),
          then: (r: any) => Promise.resolve(result).then(r),
        };
      },
      update(values: Row) {
        return {
          eq(col: string, val: any) {
            tables[name] = (tables[name] ?? []).map((r) => (r[col] === val ? { ...r, ...values } : r));
            return Promise.resolve({ data: null, error: null });
          },
        };
      },
    };
    return api;
  };

  return { from: (name: string) => build(name) };
}

vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    return makeClient();
  },
}));

const {
  canInvest,
  evaluateOnboardingGate,
  redactPerson,
  setOnboardingState,
  snapshotInvestmentProfile,
} = await import("@/lib/identity.server");
const { canTransition, isProfileRelationshipRole, isInvestmentProfileType } = await import(
  "@/lib/identity-model"
);

const MIGRATION = readFileSync(
  join(process.cwd(), "drizzle/migrations/0003_person_identity_profiles_phase2.sql"),
  "utf8",
);

beforeEach(seed);

describe("onboarding state machine", () => {
  it("allows only the defined moves", () => {
    expect(canTransition("account_created", "profile_required")).toBe(true);
    expect(canTransition("aml_pending", "verified")).toBe(true);
    expect(canTransition("account_created", "verified")).toBe(false);
    expect(canTransition("kyc_pending", "verified")).toBe(false);
  });

  it("refuses an unknown state", () => {
    expect(canTransition("verified", "super_verified")).toBe(false);
    expect(canTransition("nonsense", "verified")).toBe(false);
  });

  it("a user cannot jump their own person record to verified", async () => {
    const result = await setOnboardingState(PERSON_B, "verified", { actorUserId: PERSON_B_USER });
    expect(result.ok).toBe(false);
    expect(tables["persons"].find((p) => p.id === PERSON_B)!["onboarding_state"]).toBe("profile_required");
  });

  it("records every accepted move in the append-only history", async () => {
    const result = await setOnboardingState(PERSON_B, "identity_required", { actorUserId: STAFF_USER });
    expect(result.ok).toBe(true);
    expect(tables["person_onboarding_events"]).toHaveLength(1);
  });
});

describe("onboarding gate", () => {
  it("lets a verified person through", async () => {
    const gate = await evaluateOnboardingGate(PERSON_A_USER);
    expect(gate.allowed).toBe(true);
    expect(gate.state).toBe("verified");
  });

  it("holds an unverified person, whatever route they navigate to", async () => {
    const gate = await evaluateOnboardingGate(PERSON_B_USER);
    expect(gate.allowed).toBe(false);
    expect(gate.nextStep).toBeTruthy();
  });

  it("holds an anonymous visitor", async () => {
    const gate = await evaluateOnboardingGate(null);
    expect(gate.allowed).toBe(false);
  });

  it("never blocks staff and service workflows", async () => {
    const gate = await evaluateOnboardingGate(STAFF_USER);
    expect(gate.allowed).toBe(true);
    expect(gate.bypass).toBe("staff");
  });
});

describe("restricted data", () => {
  it("strips date of birth and tax identifiers before they reach a browser", () => {
    const safe: any = redactPerson(tables["persons"][0] as any);
    expect(safe.date_of_birth).toBeUndefined();
    expect(safe.tax_id_reference).toBeUndefined();
    expect(safe.date_of_birth_on_file).toBe(true);
    expect(safe.tax_id_on_file).toBe(true);
  });
});

describe("canInvest", () => {
  it("is ready for a verified individual in a 506(b) fund", async () => {
    const r = await canInvest(PERSON_A_USER, PROFILE_A_IND, OFFERING_506B);
    expect(r.ready).toBe(true);
    expect(r.reasons).toEqual([]);
  });

  it("does not treat a person's KYC as verification of their LLC", async () => {
    tables["entity_verifications"] = tables["entity_verifications"].map((r) =>
      r["profile_id"] === PROFILE_A_LLC ? { ...r, kyb_status: "not_started" } : r,
    );
    const r = await canInvest(PERSON_A_USER, PROFILE_A_LLC, OFFERING_506B);
    expect(r.ready).toBe(false);
    expect(r.reasons.map((x) => x.code)).toContain("kyb_required");
  });

  it("requires the trustee's own identity verification", async () => {
    const r = await canInvest(PERSON_A_USER, PROFILE_A_TRUST, OFFERING_506B);
    expect(r.reasons.map((x) => x.code)).toContain("related_person_kyc_required");
  });

  it("does not copy the individual's accreditation to the trust", async () => {
    const r = await canInvest(PERSON_A_USER, PROFILE_A_TRUST, OFFERING_506B);
    expect(r.reasons.map((x) => x.code)).toContain("accreditation_required");
  });

  it("requires third-party verification only where the offering asks for it", async () => {
    const b = await canInvest(PERSON_A_USER, PROFILE_A_IND, OFFERING_506B);
    const c = await canInvest(PERSON_A_USER, PROFILE_A_IND, OFFERING_506C);
    expect(b.ready).toBe(true);
    expect(c.ready).toBe(false);
    expect(c.reasons.map((x) => x.code)).toContain("accreditation_required");
  });

  it("does not demand accreditation where the offering does not require it", async () => {
    tables["profile_accreditations"] = [];
    const r = await canInvest(PERSON_A_USER, PROFILE_A_IND, OFFERING_CF);
    expect(r.ready).toBe(true);
  });

  it("reports expired accreditation rather than a bare false", async () => {
    tables["profile_accreditations"] = tables["profile_accreditations"].map((a) =>
      a["profile_id"] === PROFILE_A_IND ? { ...a, expires_at: past } : a,
    );
    const r = await canInvest(PERSON_A_USER, PROFILE_A_IND, OFFERING_506B);
    expect(r.reasons.map((x) => x.code)).toContain("accreditation_expired");
  });

  it("reports pending AML review", async () => {
    tables["persons"] = tables["persons"].map((p) =>
      p["id"] === PERSON_A ? { ...p, aml_status: "review" } : p,
    );
    const r = await canInvest(PERSON_A_USER, PROFILE_A_IND, OFFERING_506B);
    expect(r.reasons.map((x) => x.code)).toContain("person_aml_pending");
  });

  it("refuses another person's profile even with a real profile id", async () => {
    const r = await canInvest(PERSON_A_USER, PROFILE_B_IND, OFFERING_506B);
    expect(r.ready).toBe(false);
    expect(r.reasons[0]!.code).toBe("not_your_profile");
  });

  it("refuses a substituted profile id that does not exist", async () => {
    const r = await canInvest(PERSON_A_USER, "cccccccc-0000-4000-8000-00000000ffff", OFFERING_506B);
    expect(r.reasons[0]!.code).toBe("profile_not_found");
  });

  it("cannot be bypassed by swapping the offering id", async () => {
    const r = await canInvest(PERSON_A_USER, PROFILE_A_TRUST, "dddddddd-0000-4000-8000-00000000ffff");
    expect(r.ready).toBe(false);
    expect(r.reasons[0]!.code).toBe("offering_not_found");
  });
});

describe("historical integrity", () => {
  it("freezes the profile, related people and entity details at execution", async () => {
    await snapshotInvestmentProfile({ profileId: PROFILE_A_LLC, offeringId: OFFERING_506B });
    const snap = tables["investment_profile_snapshots"][0]!;
    expect(snap["snapshot"].profile.display_label).toBe("Smith Holdings LLC");
    expect(snap["snapshot"].relationships).toHaveLength(1);

    tables["investment_profiles"] = tables["investment_profiles"].map((p) =>
      p["id"] === PROFILE_A_LLC ? { ...p, display_label: "Renamed LLC" } : p,
    );
    expect(tables["investment_profile_snapshots"][0]!["snapshot"].profile.display_label).toBe(
      "Smith Holdings LLC",
    );
  });

  it("keeps restricted person values out of the stored snapshot", async () => {
    await snapshotInvestmentProfile({ profileId: PROFILE_A_IND });
    const snap = tables["investment_profile_snapshots"][0]!;
    expect(snap["snapshot"].person.tax_id_reference).toBeUndefined();
    expect(snap["snapshot"].person.date_of_birth).toBeUndefined();
  });
});

describe("closed vocabularies", () => {
  it("rejects invented profile types and relationship roles", () => {
    expect(isInvestmentProfileType("llc")).toBe(true);
    expect(isInvestmentProfileType("shell_company")).toBe(false);
    expect(isProfileRelationshipRole("trustee")).toBe(true);
    expect(isProfileRelationshipRole("verified_owner")).toBe(false);
  });
});

describe("database policies", () => {
  it("enables row level security on every new table", () => {
    for (const table of [
      "persons",
      "person_onboarding_events",
      "investment_profiles",
      "investment_profile_relationships",
      "entity_verifications",
      "profile_accreditations",
      "offering_requirements",
      "investment_profile_snapshots",
    ]) {
      expect(MIGRATION).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    }
  });

  it("never grants FOR ALL to authenticated", () => {
    expect(MIGRATION).not.toMatch(/FOR ALL TO authenticated/i);
  });

  it("does not let a client write verification state on any new table", () => {
    expect(MIGRATION).not.toMatch(/GRANT (INSERT|UPDATE)[^;]*ON public\.entity_verifications TO authenticated/i);
    expect(MIGRATION).not.toMatch(/GRANT (INSERT|UPDATE)[^;]*ON public\.profile_accreditations TO authenticated/i);
    expect(MIGRATION).not.toMatch(/GRANT (INSERT|UPDATE)[^;]*ON public\.persons TO authenticated/i);
  });

  it("only lets people attach themselves to a profile they own", () => {
    expect(MIGRATION).toContain(
      "WITH CHECK (private.owns_investment_profile(profile_id) AND private.person_is_self(person_id))",
    );
  });

  it("keeps restricted person columns out of the authenticated grant", () => {
    const grant = MIGRATION.slice(MIGRATION.indexOf("GRANT SELECT ("), MIGRATION.indexOf("GRANT ALL ON public.persons"));
    expect(grant).not.toContain("date_of_birth");
    expect(grant).not.toContain("tax_id_reference");
  });

  it("makes executed snapshots immutable", () => {
    expect(MIGRATION).toContain("investment_profile_snapshots_immutable");
    expect(MIGRATION).toContain("snapshots are immutable");
  });
});
