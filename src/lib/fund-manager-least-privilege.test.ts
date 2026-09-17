import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Least-privilege fund managers.
 *
 * Fund managers are read-only at the database level; every mutation they are
 * still allowed to make runs through a server workflow that re-resolves the
 * target record and checks the fund it really belongs to. These tests cover
 * both halves: the authorization helper, and the policies/source guarantees.
 */

const FUND_A = "11111111-1111-4111-8111-111111111111";
const FUND_B = "22222222-2222-4222-8222-222222222222";
const APP_A = "aaaaaaaa-1111-4111-8111-111111111111";
const APP_B = "bbbbbbbb-2222-4222-8222-222222222222";
const PAYMENT_A = "cccccccc-1111-4111-8111-111111111111";
const INVITE_A = "dddddddd-1111-4111-8111-111111111111";
const INVITE_B = "dddddddd-2222-4222-8222-222222222222";

const MANAGER_A = "manager-a";
const MANAGER_B = "manager-b";
const ADMIN = "admin-1";
const INVESTOR = "investor-1";
const ANON = "nobody";

type Write = { table: string; op: string; payload: unknown };
const writes: Write[] = [];

const tables: Record<string, any[]> = {
  user_roles: [
    { user_id: MANAGER_A, role: "fund_manager" },
    { user_id: MANAGER_B, role: "fund_manager" },
    { user_id: ADMIN, role: "admin" },
    { user_id: INVESTOR, role: "investor" },
  ],
  fund_managers: [
    { user_id: MANAGER_A, offering_id: FUND_A },
    { user_id: MANAGER_B, offering_id: FUND_B },
  ],
  investor_applications: [
    { id: APP_A, user_id: "inv-a", offering_id: FUND_A },
    { id: APP_B, user_id: "inv-b", offering_id: FUND_B },
  ],
  payments: [{ id: PAYMENT_A, application_id: APP_A, status: "awaiting_wire", amount_cents: 100 }],
  fund_invitations: [
    { id: INVITE_A, offering_id: FUND_A, email: "a@example.com", role: "investor", status: "pending" },
    { id: INVITE_B, offering_id: FUND_B, email: "b@example.com", role: "investor", status: "pending" },
  ],
};

function builder(table: string) {
  let rows = [...(tables[table] ?? [])];
  const api: any = {
    select: () => api,
    order: () => api,
    limit: () => api,
    eq: (col: string, val: unknown) => {
      rows = rows.filter((r) => r[col] === val);
      return api;
    },
    in: (col: string, vals: unknown[]) => {
      rows = rows.filter((r) => vals.includes(r[col]));
      return api;
    },
    maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
    then: (resolve: any) => resolve({ data: rows, error: null }),
    insert: (payload: unknown) => {
      writes.push({ table, op: "insert", payload });
      return Promise.resolve({ data: null, error: null });
    },
    upsert: (payload: unknown) => {
      writes.push({ table, op: "upsert", payload });
      return Promise.resolve({ data: null, error: null });
    },
    update: (payload: unknown) => {
      writes.push({ table, op: "update", payload });
      return api;
    },
    delete: () => {
      writes.push({ table, op: "delete", payload: null });
      return api;
    },
  };
  return api;
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (table: string) => builder(table) },
}));

import {
  assertInvitableRole,
  authorizeApplication,
  authorizeInvitation,
  authorizeOffering,
  authorizePayment,
  reviewerScope,
} from "./reviewer-authz.server";

beforeEach(() => {
  writes.length = 0;
});

describe("reviewer authorization", () => {
  it("lets Manager A act on their own fund", async () => {
    const authz = await authorizeApplication(MANAGER_A, APP_A);
    expect(authz.offeringId).toBe(FUND_A);
  });

  it("refuses Manager A on another fund's application", async () => {
    await expect(authorizeApplication(MANAGER_A, APP_B)).rejects.toThrow(/do not manage/i);
  });

  it("refuses Manager A on another fund directly", async () => {
    await expect(authorizeOffering(MANAGER_A, FUND_B)).rejects.toThrow(/do not manage/i);
  });

  it("resolves a payment through its own application, not the supplied fund", async () => {
    const authz = await authorizePayment(MANAGER_A, PAYMENT_A);
    expect(authz.application.offering_id).toBe(FUND_A);
  });

  it("refuses Manager B on a payment belonging to Fund A", async () => {
    await expect(authorizePayment(MANAGER_B, PAYMENT_A)).rejects.toThrow(/do not manage/i);
  });

  it("refuses Manager A on another fund's invitation", async () => {
    await expect(authorizeInvitation(MANAGER_A, INVITE_B)).rejects.toThrow(/do not manage/i);
    await expect(authorizeInvitation(MANAGER_A, INVITE_A)).resolves.toBeTruthy();
  });

  it("performs no write while authorization is being decided", async () => {
    await expect(authorizeApplication(MANAGER_A, APP_B)).rejects.toThrow();
    expect(writes).toHaveLength(0);
  });

  it("keeps administrators able to act on every fund", async () => {
    await expect(authorizeApplication(ADMIN, APP_B)).resolves.toBeTruthy();
    await expect(authorizeOffering(ADMIN, FUND_A)).resolves.toBeTruthy();
  });

  it("refuses investors and signed-out users", async () => {
    await expect(reviewerScope(INVESTOR)).rejects.toThrow(/reviewer access/i);
    await expect(reviewerScope(ANON)).rejects.toThrow(/reviewer access/i);
    await expect(authorizeApplication(INVESTOR, APP_A)).rejects.toThrow();
  });
});

describe("invitation role whitelist", () => {
  it("allows investor and fund manager", () => {
    expect(assertInvitableRole("investor")).toBe("investor");
    expect(assertInvitableRole("fund_manager")).toBe("fund_manager");
  });

  it("rejects every privileged role, whatever the browser sends", () => {
    for (const role of [
      "admin",
      "super_admin",
      "operations",
      "compliance",
      "legal",
      "finance",
      "executive",
      "fund_administration",
      "",
      null,
      undefined,
      { role: "admin" },
    ]) {
      expect(() => assertInvitableRole(role as unknown)).toThrow(/investors and fund managers/i);
    }
  });
});

const migrationDir = join(process.cwd(), "drizzle", "migrations");
const migrationSql = readdirSync(migrationDir)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(join(migrationDir, f), "utf8"))
  .join("\n");

const RESTRICTED = [
  "investor_applications",
  "payments",
  "subscriptions",
  "accreditation_records",
  "kyc_verifications",
  "aml_screenings",
  "investor_emails",
  "admin_notes",
  "fund_managers",
  "fund_invitations",
];

describe("database policies", () => {
  it("replaces every manager write policy with a read-only policy", () => {
    for (const table of RESTRICTED) {
      expect(migrationSql).toMatch(new RegExp(`CREATE POLICY "managers read [^"]+"\\s+ON public\\.${table} FOR SELECT`));
    }
    expect(migrationSql).toContain('DROP POLICY IF EXISTS "managers review applications"');
    expect(migrationSql).toContain('DROP POLICY IF EXISTS "managers manage payments"');
    expect(migrationSql).toContain('DROP POLICY IF EXISTS "managers manage fund managers for their funds"');
  });

  it("keeps the existing fund scoping helpers", () => {
    expect(migrationSql).toContain("private.manages_offering(offering_id)");
    expect(migrationSql).toContain("private.can_review_application(application_id)");
  });
});

const reviewerFiles = [
  "admin.functions.ts",
  "invitations.functions.ts",
  "application-approval.functions.ts",
  "closing.functions.ts",
  "manager.functions.ts",
  "bank-feed.functions.ts",
];

describe("reviewer workflows write with verified server authorization", () => {
  it("never writes to a restricted table with the caller's own client", () => {
    for (const file of reviewerFiles) {
      const source = readFileSync(join(process.cwd(), "src", "lib", file), "utf8");
      for (const table of RESTRICTED) {
        const pattern = new RegExp(
          `\\bsupabase\\s*\\n?\\s*\\.from\\("${table}"\\)\\s*\\n?\\s*\\.(update|insert|upsert|delete)`,
        );
        expect(source, `${file} writes to ${table} with the user client`).not.toMatch(pattern);
      }
    }
  });

  it("takes the note author and the payment's application from the server", () => {
    const source = readFileSync(join(process.cwd(), "src", "lib", "admin.functions.ts"), "utf8");
    expect(source).toContain("author_id: userId");
    expect(source).toContain("That payment does not belong to this application.");
  });

  it("audits every fund access grant and removal", () => {
    const source = readFileSync(join(process.cwd(), "src", "lib", "invitations.functions.ts"), "utf8");
    expect(source).toContain('action: "granted"');
    expect(source).toContain('action: "removed"');
  });
});
