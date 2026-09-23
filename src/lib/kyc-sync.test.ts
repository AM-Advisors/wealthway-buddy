/**
 * Adversarial proofs for provider synchronisation: webhook authentication,
 * replay, idempotency, session ownership and missed-webhook recovery.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { verifyDiditWebhook } from "@/lib/didit.server";

// ---------------------------------------------------------------------------
// A minimal stand-in for the admin client: enough of the query builder for the
// synchronisation path, with every write recorded for inspection.
// ---------------------------------------------------------------------------

type Row = Record<string, any>;
const tables: Record<string, Row[]> = {};
const writes: { table: string; op: string; payload: Row; filters: Row }[] = [];

function matches(row: Row, filters: Row) {
  return Object.entries(filters).every(([key, value]) => {
    if (key.startsWith("__")) return true;
    return row[key] === value;
  });
}

function builder(table: string) {
  const filters: Row = {};
  const api: any = {
    select: () => api,
    order: () => api,
    limit: () => api,
    not: () => api,
    lt: () => api,
    in: () => api,
    is: () => api,
    or: (expr: string) => {
      const value = expr.split("eq.")[1]?.split(",")[0];
      filters["__or"] = value;
      return api;
    },
    contains: () => api,
    eq: (column: string, value: unknown) => {
      filters[column] = value;
      return api;
    },
    maybeSingle: async () => {
      const rows = tables[table] ?? [];
      const hit =
        rows.find((row) => matches(row, filters)) ??
        (filters["__or"]
          ? rows.find((row) => row["session_id"] === filters["__or"] || row["inquiry_id"] === filters["__or"])
          : undefined);
      return { data: hit ?? null, error: null };
    },
    single: async () => {
      const rows = tables[table] ?? [];
      return { data: rows.find((row) => matches(row, filters)) ?? null, error: null };
    },
    then: (resolve: any) =>
      resolve({ data: (tables[table] ?? []).filter((row) => matches(row, filters)), error: null }),
    update: (payload: Row) => {
      const inner: any = {
        eq: (column: string, value: unknown) => {
          filters[column] = value;
          return inner;
        },
        in: () => inner,
        is: () => inner,
        then: (resolve: any) => {
          writes.push({ table, op: "update", payload, filters: { ...filters } });
          for (const row of tables[table] ?? []) if (matches(row, filters)) Object.assign(row, payload);
          return resolve({ data: null, error: null });
        },
      };
      return inner;
    },
    insert: (payload: Row) => {
      writes.push({ table, op: "insert", payload, filters: {} });
      tables[table] = [...(tables[table] ?? []), { id: `${table}-${writes.length}`, ...payload }];
      const inner: any = {
        select: () => inner,
        single: async () => ({ data: tables[table]![tables[table]!.length - 1], error: null }),
        then: (resolve: any) => resolve({ data: null, error: null }),
      };
      return inner;
    },
    upsert: (payload: Row) => {
      writes.push({ table, op: "upsert", payload, filters: {} });
      const rows = (tables[table] ??= []);
      const existing = rows.find(
        (row) =>
          row["verification_id"] === payload["verification_id"] &&
          row["check_kind"] === payload["check_kind"],
      );
      if (existing) Object.assign(existing, payload);
      else rows.push({ id: `${table}-${rows.length + 1}`, ...payload });
      return { then: (resolve: any) => resolve({ data: null, error: null }) };
    },
  };
  return api;
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (table: string) => builder(table) },
}));
vi.mock("@/lib/identity.server", () => ({ refreshOnboardingState: vi.fn(async () => {}) }));

const REF_A = "aaaaaaaa-1111-4111-8111-111111111111";
const REF_B = "bbbbbbbb-2222-4222-8222-222222222222";

function seed() {
  for (const key of Object.keys(tables)) delete tables[key];
  writes.length = 0;
  tables["kyc_verifications"] = [
    {
      id: "ver-a",
      application_id: "app-a",
      person_id: "person-a",
      verification_ref: REF_A,
      session_id: "sess-a",
      status: "pending",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "ver-b",
      application_id: "app-b",
      person_id: "person-b",
      verification_ref: REF_B,
      session_id: "sess-b",
      status: "pending",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
  ];
  tables["investor_applications"] = [
    { id: "app-a", user_id: "user-a", offering_id: "off-1", kyc_status: "pending" },
    { id: "app-b", user_id: "user-b", offering_id: "off-1", kyc_status: "pending" },
  ];
  tables["persons"] = [
    { id: "person-a", user_id: "user-a", legal_first_name: "Jane", legal_last_name: "Investor" },
    { id: "person-b", user_id: "user-b", legal_first_name: "Robert", legal_last_name: "Other" },
  ];
  tables["person_addresses"] = [];
  tables["compliance_holds"] = [];
  tables["investor_onboardings"] = [];
  tables["offering_requirements"] = [];
  tables["aml_screenings"] = [];
  tables["identity_check_results"] = [];
  tables["person_onboarding_events"] = [];
}

const approved = {
  session_id: "sess-a",
  status: "Approved",
  id_verification: {
    status: "Approved",
    document_type: "Passport",
    expiration_date: "2032-01-01",
    document_number: "X1234567",
    full_name: "Jane Investor",
    warnings: [],
  },
  liveness: { status: "Approved", warnings: [] },
  face_match: { status: "Approved", score: 90, warnings: [] },
  aml: { status: "Approved", hits: [] },
};

function stubProvider(decision: Record<string, any> | null) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      decision
        ? ({ ok: true, json: async () => decision } as any)
        : ({ ok: false, status: 404, json: async () => ({}) } as any),
    ),
  );
}

beforeEach(() => {
  seed();
  process.env["DIDIT_API_KEY"] = "test-key";
  vi.unstubAllGlobals();
});

describe("webhook authentication", () => {
  const secret = "topsecret";
  const body = JSON.stringify({ session_id: "sess-a", status: "Approved" });
  const sign = (timestamp: string) =>
    createHmac("sha256", secret).update(body).digest("hex") && {
      timestamp,
      signature: createHmac("sha256", secret).update(body).digest("hex"),
    };

  it("rejects an unsigned call", () => {
    const result = verifyDiditWebhook({
      secret,
      rawBody: body,
      timestampHeader: String(Math.floor(Date.now() / 1000)),
      signatureV2: null,
      signature: null,
      signatureSimple: null,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a stale or replayed timestamp", () => {
    const stale = String(Math.floor(Date.now() / 1000) - 60 * 60);
    const { signature } = sign(stale) as any;
    const result = verifyDiditWebhook({
      secret,
      rawBody: body,
      timestampHeader: stale,
      signatureV2: null,
      signature,
      signatureSimple: signature,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a forged signature", () => {
    const now = String(Math.floor(Date.now() / 1000));
    const result = verifyDiditWebhook({
      secret,
      rawBody: body,
      timestampHeader: now,
      signatureV2: null,
      signature: "deadbeef",
      signatureSimple: "deadbeef",
    });
    expect(result.ok).toBe(false);
  });
});

describe("session correlation and synchronisation", () => {
  it("resolves by the opaque Harmonious reference, never by email", async () => {
    const { resolveVerification } = await import("@/lib/kyc-verification.server");
    const found = await resolveVerification({ vendorData: REF_B, sessionId: null });
    expect(found?.id).toBe("ver-b");
  });

  it("a session belonging to one person never updates another", async () => {
    stubProvider(approved);
    const { resolveVerification, syncVerification } = await import("@/lib/kyc-verification.server");
    const verification = await resolveVerification({ vendorData: REF_A, sessionId: "sess-a" });
    await syncVerification({ verification: verification!, trigger: "webhook" });

    const touchedApplications = writes
      .filter((w) => w.table === "investor_applications" && w.op === "update")
      .map((w) => w.filters["id"]);
    expect(touchedApplications).toContain("app-a");
    expect(touchedApplications).not.toContain("app-b");
    expect(tables["kyc_verifications"]!.find((r) => r["id"] === "ver-b")!["status"]).toBe("pending");
  });

  it("an email change does not break session ownership", async () => {
    stubProvider({ ...approved, email: "brand-new@example.com" });
    const { resolveVerification } = await import("@/lib/kyc-verification.server");
    const found = await resolveVerification({ vendorData: REF_A, sessionId: "sess-a" });
    expect(found?.id).toBe("ver-a");
  });

  it("re-reads the authoritative decision from the provider rather than trusting the payload", async () => {
    stubProvider(approved);
    const { resolveVerification, syncVerification } = await import("@/lib/kyc-verification.server");
    const verification = await resolveVerification({ vendorData: REF_A, sessionId: "sess-a" });
    const result = await syncVerification({
      verification: verification!,
      trigger: "webhook",
      // A forged payload claiming approval is ignored while the API answers.
      fallbackPayload: { decision: { status: "Approved" } },
    });
    expect(result.source).toBe("provider_api");
    expect(result.applied).toBe(true);
  });

  it("a duplicate delivery produces the same single set of results", async () => {
    stubProvider(approved);
    const { resolveVerification, syncVerification } = await import("@/lib/kyc-verification.server");
    const verification = await resolveVerification({ vendorData: REF_A, sessionId: "sess-a" });
    await syncVerification({ verification: verification!, trigger: "webhook" });
    const afterFirst = (tables["identity_check_results"] ?? []).length;
    await syncVerification({ verification: verification!, trigger: "webhook" });
    expect((tables["identity_check_results"] ?? []).length).toBe(afterFirst);
    expect((tables["aml_screenings"] ?? []).length).toBe(1);
  });

  it("stores no temporary provider document links or full document numbers", async () => {
    stubProvider({
      ...approved,
      id_verification: {
        ...approved.id_verification,
        front_image: "https://didit-verification.s3.amazonaws.com/tmp/f.jpg?X-Amz-Signature=x",
      },
    });
    const { resolveVerification, syncVerification } = await import("@/lib/kyc-verification.server");
    const verification = await resolveVerification({ vendorData: REF_A, sessionId: "sess-a" });
    await syncVerification({ verification: verification!, trigger: "webhook" });
    const stored = JSON.stringify(
      writes.filter((w) => w.table === "kyc_verifications").map((w) => w.payload),
    );
    expect(stored).not.toContain("X-Amz-Signature");
    expect(stored).not.toContain("X1234567");
  });
});

describe("missed webhook recovery", () => {
  it("reconciles an outstanding session from the provider API", async () => {
    stubProvider(approved);
    const { reconcileOutstandingVerifications } = await import("@/lib/kyc-verification.server");
    const result = await reconcileOutstandingVerifications({ verificationId: "ver-a" });
    expect(result.checked).toBe(1);
    expect(result.synchronised).toBe(1);
  });

  it("never creates a new verification session during reconciliation", async () => {
    stubProvider(approved);
    const { reconcileOutstandingVerifications } = await import("@/lib/kyc-verification.server");
    await reconcileOutstandingVerifications({ verificationId: "ver-a" });
    const created = writes.filter(
      (w) => w.table === "kyc_verifications" && w.op === "insert",
    );
    expect(created).toHaveLength(0);
  });

  it("applies nothing when the provider has no decision to give", async () => {
    stubProvider(null);
    const { resolveVerification, syncVerification } = await import("@/lib/kyc-verification.server");
    const verification = await resolveVerification({ vendorData: REF_A, sessionId: "sess-a" });
    const result = await syncVerification({ verification: verification!, trigger: "reconciliation" });
    expect(result.applied).toBe(false);
  });
});
