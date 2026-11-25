import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ resolve: vi.fn(), from: vi.fn(), coverage: vi.fn(), entitlements: vi.fn(), hidden: vi.fn(), services: vi.fn() }));
vi.mock("./view-as.server", () => ({ resolvePerspective: mocks.resolve }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: mocks.from } }));
vi.mock("./report-card-coverage.server", () => ({ subjectCoverage: mocks.coverage }));
vi.mock("./saas-orders.server", () => ({ myEntitlements: mocks.entitlements }));
vi.mock("./client-tab-access.server", () => ({ myHiddenTabs: mocks.hidden }));
vi.mock("./service-menu.server", () => ({ myServiceMenu: mocks.services }));
import { clientPerspectiveMenu } from "./client-perspective-menu.server";

describe("Authorized client menu reader, fictional records only", () => {
  beforeEach(() => { vi.resetAllMocks(); });
  it("reads the exact fund's client even when no manager login exists", async () => {
    mocks.resolve.mockResolvedValue({ perspective: "fund_manager", offeringId: "fictional-fund", subjectUserId: "fictional-staff", preview: true });
    const queries: { table: string; filters: [string, unknown][] }[] = [];
    const data: Record<string, unknown> = {
      offerings: { client_id: "fictional-client" }, clients: { menu_gating: "entitlements" },
      service_entitlements: [{ service_key: "fund_platform", offering_id: null }, { service_key: "portfolio_reporting", offering_id: "other-fund" }],
      client_tab_access: [{ tab_key: "documents", enabled: false }], cap_table_subscriptions: [], wealth_service_selections: [],
    };
    mocks.from.mockImplementation((table: string) => {
      const query = { table, filters: [] as [string, unknown][] }; queries.push(query);
      const result = { data: data[table], error: null };
      const chain = { select: () => chain, eq: (key: string, value: unknown) => { query.filters.push([key, value]); return chain; }, maybeSingle: async () => result, then: (done: (v: typeof result) => unknown) => Promise.resolve(result).then(done) };
      return chain;
    });
    mocks.coverage.mockResolvedValue({ via: null });
    const result = await clientPerspectiveMenu("fictional-staff", "fictional-session", "sandbox");
    expect(mocks.resolve).toHaveBeenCalledWith("fictional-staff", "fictional-session");
    expect(result?.services).toEqual({ wealth: false, reportCards: false });
    expect(result?.hiddenTabs).toContain("documents");
    expect(result?.entitlements).not.toContain("portfolio_reporting");
    for (const table of ["clients", "service_entitlements", "client_tab_access", "cap_table_subscriptions"]) {
      expect(queries.find((q) => q.table === table)?.filters).toContainEqual([table === "clients" ? "id" : "client_id", "fictional-client"]);
    }
    expect(mocks.services).not.toHaveBeenCalled();
  });
  it("returns no menu without a live authorized session and never reads records", async () => {
    mocks.resolve.mockResolvedValue(null);
    expect(await clientPerspectiveMenu("fictional-staff", null, "sandbox")).toBeNull();
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("reads investor services through the subject's existing readers, not staff", async () => {
    mocks.resolve.mockResolvedValue({ perspective: "investor", offeringId: "fictional-fund", subjectUserId: "fictional-investor" });
    mocks.entitlements.mockResolvedValue(["fund_platform"]); mocks.hidden.mockResolvedValue([]); mocks.services.mockResolvedValue({ wealth: false, reportCards: true });
    expect((await clientPerspectiveMenu("fictional-staff", "fictional-session", "sandbox"))?.services.reportCards).toBe(true);
    expect(mocks.services).toHaveBeenCalledWith("fictional-investor");
    expect(mocks.entitlements).toHaveBeenCalledWith("fictional-investor");
    expect(mocks.hidden).toHaveBeenCalledWith("fictional-investor");
  });
});