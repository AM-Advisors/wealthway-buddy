import { beforeEach, describe, expect, it, vi } from "vitest";
import { summarizeFundAccess } from "./fund-access";

const mock = vi.hoisted(() => ({ access: vi.fn(), roster: vi.fn(), desk: vi.fn(), compute: vi.fn(), signed: vi.fn(), published: vi.fn(), from: vi.fn(), names: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: mock.from } }));
vi.mock("./fund-access.server", () => ({ fundAccessFor: mock.access }));
vi.mock("./investor-onboarding.server", () => ({ fundRosterViewer: mock.roster, investorDeskActor: mock.desk, computeReadinessFor: mock.compute, investorSideSignedDocuments: mock.signed, publishedQuestionnaire: mock.published }));
vi.mock("./profile-name.server", () => ({ loadAccountNames: mock.names }));
import { investorPerspective } from "./investor-perspective.server";

const onb = { id: "investment-one", offering_id: "fund-one", stage: "signature", funding_status: "awaiting", questionnaire_version: 1, questionnaire_responses: { experience: "8", tax_id: "private-value" } };
let participants: unknown[];
let events: unknown[];
const facts = { person: { legal_first_name: "John", legal_last_name: "Smith", address_line1: "123 Fictional Lane", ssn: "never-return" }, profile: { display_label: "John Smith", profile_type: "individual" }, requirements: [], documents: [{ id: "sub", title: "Subscription Agreement", requiresSignature: true, signed: false }], countersignTiming: null };
const result = { items: [], stages: [], closeReady: false };

beforeEach(() => {
  vi.clearAllMocks(); participants = []; events = [];
  mock.access.mockResolvedValue(summarizeFundAccess({ staff: false, manager: true, clientMember: false, teamRole: null, teamSource: null }));
  mock.roster.mockResolvedValue({}); mock.desk.mockResolvedValue({ viaTeam: false });
  mock.compute.mockResolvedValue({ facts, result }); mock.signed.mockResolvedValue(new Set(["sub"])); mock.names.mockResolvedValue(new Map());
  mock.published.mockResolvedValue(null);
  mock.from.mockImplementation((table: string) => {
    const data = table === "investor_onboardings" ? onb : table === "offerings" ? { name: "Fictional fund" } : table === "onboarding_participants" ? participants : table === "investor_onboarding_events" ? events : table === "offering_questionnaires" ? [{ questions: [{ key: "experience", label: "Investing experience", type: "text" }, { key: "tax_id", label: "Tax ID", type: "text" }] }] : [];
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "is", "in", "order", "limit"]) chain[method] = vi.fn(() => chain);
    chain["maybeSingle"] = vi.fn(async () => ({ data, error: null }));
    chain["then"] = (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve);
    return chain;
  });
});

describe("authorized investor perspective reads", () => {
  it("checks the investment's exact fund before reading private facts", async () => {
    await investorPerspective("manager", { onboardingId: onb.id });
    expect(mock.access).toHaveBeenCalledWith(expect.anything(), "manager", "fund-one");
    expect(mock.roster).toHaveBeenCalledWith("manager", "fund-one");
  });
  it("denies another fund and client membership alone before computing facts", async () => {
    mock.access.mockResolvedValue(summarizeFundAccess({ staff: false, manager: false, clientMember: true, teamRole: null, teamSource: null }));
    await expect(investorPerspective("other-fund", { onboardingId: onb.id })).rejects.toThrow("authorized team");
    expect(mock.compute).not.toHaveBeenCalled();
  });
  it("keeps viewer-only team answers and addresses private", async () => {
    mock.access.mockResolvedValue(summarizeFundAccess({ staff: false, manager: false, clientMember: false, teamRole: "fund_viewer", teamSource: "grant" }));
    mock.desk.mockRejectedValue(new Error("not authorized for details"));
    const view = await investorPerspective("viewer", { onboardingId: onb.id });
    expect(view.questions).toEqual([]); expect(view.person).toEqual([]); expect(view.canReadDetails).toBe(false);
  });
  it("includes saved eligible answers but omits protected tax identifiers", async () => {
    const view = await investorPerspective("manager", { onboardingId: onb.id });
    expect(view.questions).toEqual([{ key: "experience", label: "Investing experience", answer: "8" }]);
    expect(JSON.stringify(view)).not.toContain("private-value"); expect(JSON.stringify(view)).not.toContain("never-return");
  });
  it("refuses a removed or different-investment preparer instead of activating them", async () => {
    await expect(investorPerspective("manager", { onboardingId: onb.id, participantId: "wrong-helper" })).rejects.toThrow("no longer available");
  });
  it("opens an active exact-investment preparer without returning their token or email", async () => {
    participants = [{ id: "helper", full_name: "Jordan Helper", role: "preparer", status: "invited", token: "private-token", email: "private-email" }];
    const view = await investorPerspective("manager", { onboardingId: onb.id, participantId: "helper" });
    expect(view.selectedParticipant).toEqual({ id: "helper", name: "Jordan Helper", role: "preparer" });
    expect(JSON.stringify(view)).not.toContain("private-token"); expect(JSON.stringify(view)).not.toContain("private-email");
  });
  it("uses investor-side signature evidence while countersignature is outstanding", async () => {
    const view = await investorPerspective("manager", { onboardingId: onb.id });
    expect(view.documents[0]?.status).toBe("Investor signed: awaiting fund countersignature");
  });
  it("shows system attribution separately from the triggering account", async () => {
    events = [{ id: "event-one", event: "signature_completed", actor_role: "system", actor_user_id: "staff", created_at: "2026-11-24T11:00:00Z" }];
    mock.names.mockResolvedValue(new Map([["staff", "Staff member"]]));
    const view = await investorPerspective("manager", { onboardingId: onb.id });
    expect(view.history[0]?.actor).toBe("System");
  });
});