import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  activityFor, bulkSummary, classifyBulk, committable, createNewBlocker, dbProfileType, maskEmail, parseCsv, planIncoming,
  rankMatches, recordStatus, removalBlocker, sanitizePatch, validateQuickAdd, type PersonCandidate,
} from "@/lib/investor-record-model";

/* ---------------- in-memory fake of the service-role client ---------------- */
type Row = Record<string, any>;
const tables: Record<string, Row[]> = {};
let seq = 0;
function q(name: string) {
  const t = (tables[name] ??= []);
  const filters: ((r: Row) => boolean)[] = [];
  let op: "select" | "update" | "insert" = "select"; let payload: any = null; let lim = Infinity;
  const rows = () => t.filter((r) => filters.every((f) => f(r)));
  const run = () => {
    if (op === "insert") {
      const list = (Array.isArray(payload) ? payload : [payload]).map((p: Row) => ({ id: `id-${++seq}`, created_at: new Date(Date.now() + seq).toISOString(), ...p }));
      if (name === "investor_onboardings") for (const r of list) {
        const dupe = t.some((o) => o.offering_id === r.offering_id && r.investment_profile_id && o.investment_profile_id === r.investment_profile_id && !o.removed_at && !["closed", "declined", "cancelled"].includes(o.stage));
        if (dupe) return { data: null, error: { code: "23505", message: "duplicate" } };
      }
      t.push(...list); return { data: Array.isArray(payload) ? list : list[0], error: null };
    }
    if (op === "update") { const hit = rows(); hit.forEach((r) => Object.assign(r, payload)); return { data: hit, error: null }; }
    return { data: rows().slice(0, lim), error: null };
  };
  const b: any = {
    select: () => b,
    eq: (k: string, v: any) => { filters.push((r) => r[k] === v); return b; },
    ilike: (k: string, v: string) => { filters.push((r) => String(r[k] ?? "").toLowerCase() === String(v).toLowerCase()); return b; },
    is: (k: string, v: any) => { filters.push((r) => (r[k] ?? null) === v); return b; },
    in: (k: string, v: any[]) => { filters.push((r) => v.includes(r[k])); return b; },
    not: (k: string, opx: string, v: any) => {
      if (opx === "in") { const list = String(v).replace(/[()]/g, "").split(","); filters.push((r) => !list.includes(r[k])); }
      else filters.push((r) => (r[k] ?? null) !== v);
      return b;
    },
    order: () => b, limit: (n: number) => { lim = n; return b; },
    insert: (p: any) => { op = "insert"; payload = p; return b; },
    update: (p: any) => { op = "update"; payload = p; return b; },
    maybeSingle: async () => { const r = run(); return { data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error }; },
    single: async () => run(),
    then: (res: any, rej: any) => Promise.resolve(run()).then(res, rej),
  };
  return b;
}
const authUsers: Record<string, { email: string; email_confirmed_at: string | null }> = {};
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: (n: string) => q(n), auth: { admin: { getUserById: async (id: string) => ({ data: { user: authUsers[id] ?? null } }) } } },
}));

const FUND_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FUND_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const STAFF = "staff", MGR_A = "mgr-a", JANE = "jane-user";
const reconciled: string[] = [];
vi.mock("@/lib/investor-onboarding.server", () => {
  const actor = async (u: string) => ({ userId: u, isStaff: u === STAFF, managedOfferingIds: u === MGR_A ? [FUND_A] : [] });
  return {
    forbid: (m: string) => { throw new Error(`Forbidden: ${m}`); },
    onboardingActor: actor,
    launchedOffering: async (id: string) => ({ offering: { id }, setup: {} }),
    reconcileAfter: async (ids: string[]) => { reconciled.push(...ids.filter(Boolean)); },
    computeReadinessFor: async () => ({ result: { closeReady: false, nextAction: null, stages: [] } }),
    assertOnboardingAccess: async (u: string, id: string) => {
      const a = await actor(u); const row = tables["investor_onboardings"]!.find((r) => r.id === id);
      if (!row) throw new Error("not found");
      if (a.isStaff) return { actor: a, row, role: "staff" };
      if (row.investor_user_id === u) return { actor: a, row, role: "investor" };
      if (a.managedOfferingIds.includes(row.offering_id)) return { actor: a, row, role: "manager" };
      throw new Error("Forbidden: this investment is not yours.");
    },
  };
});
const srv = () => import("@/lib/investor-record.server");

const jane = (over: Record<string, unknown> = {}) => ({
  offeringId: FUND_A, person: { firstName: "Jane", lastName: "Smith", email: "jane@example.com", addressLine1: "1 Main St" },
  profile: { type: "individual" }, investment: { amountCents: 10_000_000 }, ...over,
});

beforeEach(() => { for (const k of Object.keys(tables)) delete tables[k]; reconciled.length = 0; for (const k of Object.keys(authUsers)) delete authUsers[k]; });

describe("manual entry", () => {
  it("Operations manually creates an investor without an account, labelled as Harmonious", async () => {
    const r = await (await srv()).createInvestor(STAFF, jane());
    const onb = tables["investor_onboardings"]![0]!;
    expect(onb.investor_user_id).toBeNull();
    expect(onb.person_id).toBe(r.personId);
    expect(onb.entry_source).toBe("harmonious");
    expect(tables["persons"]![0]!.user_id).toBeNull();
    expect(reconciled).toContain(r.onboardingId);
  });
  it("Fund Manager creates for own Fund; changes attributed to the manager", async () => {
    await (await srv()).createInvestor(MGR_A, jane());
    expect(tables["investor_onboardings"]![0]!.entry_source).toBe("fund_manager");
    expect(tables["investor_record_changes"]!.every((c) => c.actor_user_id === MGR_A && c.source === "fund_manager")).toBe(true);
  });
  it("Fund Manager cannot create for an unrelated Fund", async () => {
    await expect((await srv()).createInvestor(MGR_A, jane({ offeringId: FUND_B }))).rejects.toThrow(/Forbidden/);
    expect(tables["persons"] ?? []).toHaveLength(0);
  });
  it("managers cannot set staff-only or sensitive fields", async () => {
    await (await srv()).createInvestor(MGR_A, jane({ person: { firstName: "Jane", lastName: "Smith", email: "jane@example.com", dateOfBirth: "1980-01-01" }, investment: { amountCents: 100, acceptedCents: 999, internalNotes: "x" } }));
    const onb = tables["investor_onboardings"]![0]!;
    expect(onb.accepted_amount_cents).toBeUndefined();
    expect(onb.internal_notes).toBeUndefined();
    expect(tables["persons"]![0]!.date_of_birth).toBeUndefined();
  });
});

describe("duplicates and reuse", () => {
  it("same email requires explicit choice; existing Person is reused", async () => {
    const s = await srv();
    const first = await s.createInvestor(STAFF, jane());
    await expect(s.createInvestor(STAFF, jane({ offeringId: FUND_B }))).rejects.toThrow(/already exists/);
    const again = await s.createInvestor(STAFF, jane({ offeringId: FUND_B, personId: first.personId }));
    expect(again.personId).toBe(first.personId);
    expect(tables["persons"]).toHaveLength(1);
  });
  it("multiple Profiles for one Person remain distinct", async () => {
    const s = await srv();
    const a = await s.createInvestor(STAFF, jane());
    const b = await s.createInvestor(STAFF, jane({ personId: a.personId, profile: { type: "trust", legalName: "Smith Family Trust" } }));
    expect(b.profileId).not.toBe(a.profileId);
    expect(tables["investment_profiles"]!.map((p) => p.profile_type).sort()).toEqual(["individual", "trust"]);
  });
  it("same Profile already in the Fund is refused (no duplicate Investment)", async () => {
    const s = await srv();
    const a = await s.createInvestor(STAFF, jane());
    await expect(s.createInvestor(STAFF, jane({ personId: a.personId, profileId: a.profileId }))).rejects.toThrow(/already in this Fund/);
    expect(tables["investor_onboardings"]).toHaveLength(1);
  });
  it("a pending invitation is linked instead of duplicated", async () => {
    tables["fund_invitations"] = [{ id: "inv-1", offering_id: FUND_A, email: "jane@example.com", invite_role: "investor", status: "pending" }];
    await (await srv()).createInvestor(MGR_A, jane());
    expect(tables["investor_onboardings"]![0]!.invitation_id).toBe("inv-1");
  });
});

describe("claim & confirmation", () => {
  it("manually created investor later continues the same record with prefilled data intact", async () => {
    const s = await srv();
    const r = await s.createInvestor(MGR_A, jane());
    authUsers[JANE] = { email: "Jane@Example.com", email_confirmed_at: "2026-01-01" };
    expect(await s.claimPreparedRecords(JANE)).toEqual({ claimed: true });
    const onb = tables["investor_onboardings"]!.find((o) => o.id === r.onboardingId)!;
    expect(onb.investor_user_id).toBe(JANE);
    expect(onb.requested_amount_cents).toBe(10_000_000);
    expect(tables["investment_profiles"]![0]!.owner_user_id).toBe(JANE);
    expect(tables["investor_onboardings"]).toHaveLength(1);
  });
  it("unverified email never claims", async () => {
    const s = await srv();
    await s.createInvestor(MGR_A, jane());
    authUsers[JANE] = { email: "jane@example.com", email_confirmed_at: null };
    expect((await s.claimPreparedRecords(JANE)).claimed).toBe(false);
  });
  it("ambiguous match goes to Harmonious review instead of merging", async () => {
    const s = await srv();
    await s.createInvestor(MGR_A, jane());
    tables["persons"]!.push({ id: "own", user_id: JANE, email: "jane@example.com" });
    authUsers[JANE] = { email: "jane@example.com", email_confirmed_at: "2026-01-01" };
    expect(await s.claimPreparedRecords(JANE)).toEqual({ claimed: false, review: true });
    expect(tables["investor_record_suggestions"]![0]!.field).toBe("account_link");
  });
  it("investor confirms and corrects only permitted fields; provenance retained", async () => {
    const s = await srv();
    const r = await s.createInvestor(MGR_A, jane());
    authUsers[JANE] = { email: "jane@example.com", email_confirmed_at: "x" };
    await s.claimPreparedRecords(JANE);
    const pre = await s.prefillForInvestor(JANE, r.onboardingId);
    expect(pre.needed).toBe(true);
    expect(pre.fields.find((f: any) => f.key === "requested_amount_cents")?.suppliedBy).toBe("fund_manager");
    await s.confirmInvestorInformation(JANE, { onboardingId: r.onboardingId, corrections: { phone: "555", legal_last_name: "Hacked" } });
    const p = tables["persons"]![0]!;
    expect(p.phone).toBe("555");
    expect(p.legal_last_name).toBe("Smith");
    expect(tables["investor_onboardings"]![0]!.investor_confirmed_at).toBeTruthy();
  });
});

describe("sync, provenance and scope", () => {
  it("updates change canonical records once, log old/new, and reconcile readiness", async () => {
    const s = await srv();
    const r = await s.createInvestor(STAFF, jane());
    reconciled.length = 0;
    await s.updateInvestorRecord(STAFF, { onboardingId: r.onboardingId, person: { lastName: "Jones" }, investment: { amountCents: 12_500_000 } });
    expect(tables["persons"]![0]!.legal_last_name).toBe("Jones");
    const list = await s.fundInvestorRecords(STAFF, FUND_A);
    expect(list.items[0]!.name).toBe("Jane Jones");
    expect(list.items[0]!.amountCents).toBe(12_500_000);
    const ch = tables["investor_record_changes"]!.find((c) => c.field === "requested_amount_cents" && c.old_value === 10_000_000)!;
    expect(ch.new_value).toBe(12_500_000);
    expect(reconciled).toEqual([r.onboardingId]);
  });
  it("a manager's material edit to investor-owned data becomes a review, not an overwrite", async () => {
    const s = await srv();
    const r = await s.createInvestor(STAFF, jane());
    Object.assign(tables["persons"]![0]!, { user_id: JANE, entry_source: "investor" });
    const out = await s.updateInvestorRecord(MGR_A, { onboardingId: r.onboardingId, person: { addressLine1: "9 Other Rd" } });
    expect(out.suggested).toBe(1);
    expect(tables["persons"]![0]!.address_line1).toBe("1 Main St");
  });
  it("Fund Manager cannot see or edit another Fund's investments", async () => {
    const s = await srv();
    const r = await s.createInvestor(STAFF, jane({ offeringId: FUND_B }));
    await expect(s.fundInvestorRecords(MGR_A, FUND_B)).rejects.toThrow(/Forbidden/);
    await expect(s.investorRecordDetail(MGR_A, r.onboardingId)).rejects.toThrow(/Forbidden/);
    await expect(s.updateInvestorRecord(MGR_A, { onboardingId: r.onboardingId, investment: { amountCents: 1 } })).rejects.toThrow(/Forbidden/);
  });
  it("manager detail view hides DOB, tax and internal notes", async () => {
    const s = await srv();
    const r = await s.createInvestor(STAFF, jane({ person: { firstName: "Jane", lastName: "Smith", email: "jane@example.com", dateOfBirth: "1980-01-01" }, investment: { amountCents: 100, internalNotes: "secret" } }));
    Object.assign(tables["persons"]![0]!, { tax_id_last4: "1234", kyc_status: "pending" });
    const d: any = await s.investorRecordDetail(MGR_A, r.onboardingId);
    expect(d.person.dateOfBirth).toBeUndefined();
    expect(d.person.taxIdOnFile).toBeUndefined();
    expect(d.investment.internalNotes).toBeUndefined();
    expect(JSON.stringify(d)).not.toContain("1234");
    expect(d.person.verificationLabel).toBe("Verification pending");
    expect(d.activity.every((a: any) => a.from === undefined)).toBe(true);
  });
  it("document suggestions never auto-apply; acceptance goes through a reviewer", async () => {
    const s = await srv();
    const r = await s.createInvestor(STAFF, jane());
    await s.proposeUpdate(STAFF, { onboardingId: r.onboardingId, subjectTable: "investor_onboardings", field: "requested_amount_cents", proposed: 12_500_000, source: "document" });
    expect(tables["investor_onboardings"]![0]!.requested_amount_cents).toBe(10_000_000);
    const sug = tables["investor_record_suggestions"]![0]!;
    await expect(s.resolveSuggestion(MGR_A, { id: sug.id, action: "accept" })).rejects.toThrow(/Forbidden/);
    await s.resolveSuggestion(STAFF, { id: sug.id, action: "accept" });
    expect(tables["investor_onboardings"]![0]!.requested_amount_cents).toBe(12_500_000);
  });
  it("removing an investor preserves the Person, profile and history", async () => {
    const s = await srv();
    const r = await s.createInvestor(MGR_A, jane());
    await s.removeFromFund(MGR_A, { onboardingId: r.onboardingId });
    expect(tables["persons"]).toHaveLength(1);
    expect(tables["investment_profiles"]).toHaveLength(1);
    expect(tables["investor_onboardings"]![0]!.removed_at).toBeTruthy();
    expect(tables["investor_record_changes"]!.some((c) => c.field === "removed_from_fund")).toBe(true);
    expect((await s.fundInvestorRecords(MGR_A, FUND_A)).items).toHaveLength(0);
  });
});

describe("bulk import", () => {
  it("previews before committing; conflicts never overwrite silently", async () => {
    const s = await srv();
    const a = await s.createInvestor(STAFF, jane({ offeringId: FUND_B }));
    const csv = "first_name,last_name,email,profile_type,amount,address\nJane,Smith,jane@example.com,individual,50000,2 New Ave\nBob,Lee,bob@example.com,individual,25000,\nBad,,nope,individual,0,";
    const p = await s.bulkPreview(MGR_A, { offeringId: FUND_A, csv });
    expect(tables["investor_onboardings"]).toHaveLength(1); // nothing committed yet
    expect(p.summary).toMatchObject({ needs_review: 1, create_new: 1, invalid: 1 });
    await s.bulkCommit(MGR_A, { importId: p.importId, decisions: {} });
    expect(tables["persons"]!.find((x) => x.id === a.personId)!.address_line1).toBe("1 Main St");
    expect(tables["investor_record_suggestions"]!.some((x) => x.source === "bulk")).toBe(true);
    expect(tables["persons"]!.filter((x) => x.email === "jane@example.com")).toHaveLength(1);
    expect(tables["investor_onboardings"]).toHaveLength(3);
  });
});

/* ---------------- pure rules ---------------- */
const people: PersonCandidate[] = [
  { personId: "p1", email: "alyssa@example.com", firstName: "Alyssa", lastName: "Smith", profiles: [{ id: "pr1", type: "individual", legalName: "Alyssa Smith" }], inFund: false },
];
describe("model", () => {
  it("masks email and exposes only safe match facts", () => {
    expect(maskEmail("alyssa@example.com")).toBe("a•••••@example.com");
    const m = rankMatches({ email: "ALYSSA@example.com" }, people);
    expect(m[0]).toMatchObject({ strength: "email", maskedEmail: "a•••••@example.com" });
    expect(JSON.stringify(m)).not.toContain("alyssa@");
    expect(createNewBlocker(m, false)).toMatch(/already exists/);
    expect(createNewBlocker(m, true)).toBeNull();
  });
  it("quick add needs only name, email, profile type and amount", () => {
    expect(validateQuickAdd({ firstName: "A", lastName: "B", email: "a@b.co", profileType: "trust", amountCents: 1 })).toEqual([]);
    expect(validateQuickAdd({ firstName: "A" })).toHaveLength(3);
  });
  it("maps entry groups to canonical profile types", () => {
    expect(dbProfileType("entity", "llc")).toBe("llc");
    expect(dbProfileType("entity", "bogus")).toBe("other_entity");
    expect(dbProfileType("ira")).toBe("ira");
  });
  it("record status is separate from readiness", () => {
    const base = { hasEmail: true, hasName: true, hasProfile: true, hasAmount: true, hasAddress: true, entrySource: "investor", investorConfirmed: false, openConflicts: 0, openReviews: 0 };
    expect(recordStatus(base)).toBe("complete");
    expect(recordStatus({ ...base, entrySource: "fund_manager" })).toBe("investor_confirmation_needed");
    expect(recordStatus({ ...base, hasAddress: false })).toBe("missing_information");
    expect(recordStatus({ ...base, openConflicts: 1 })).toBe("conflict_detected");
  });
  it("strips forbidden sensitive keys", () => {
    expect(sanitizePatch({ tax_id: "1", ssn: "2", phone: "3", internal_notes: "x" }, { isStaff: false, managedOfferingIds: [] })).toEqual({ phone: "3" });
  });
  it("incoming values fill blanks and flag conflicts, never overwrite", () => {
    expect(planIncoming({ a: null, b: "x" }, { a: "1", b: "y" })).toEqual({ fill: { a: "1" }, conflicts: [{ field: "b", current: "x", proposed: "y" }] });
  });
  it("bulk classification", () => {
    const rows = parseCsv('first_name,last_name,email,amount\nAlyssa,Smith,alyssa@example.com,"1,000"\nNew,Person,new@x.co,5\nNew,Person,new@x.co,5');
    const c = classifyBulk(rows, [{ ...people[0]!, inFund: true }]);
    expect(c.map((r) => r.cls)).toEqual(["already_in_fund", "create_new", "invalid"]);
    expect(committable(c)).toHaveLength(1);
    expect(bulkSummary(c).invalid).toBe(1);
  });
  it("manager activity hides values and internal rows", () => {
    const a = activityFor([
      { field: "requested_amount_cents", source: "fund_manager", subject_table: "x", created_at: "t", manager_visible: true, old_value: 1, new_value: 2 },
      { field: "internal_notes", source: "harmonious", subject_table: "x", created_at: "t", manager_visible: false },
    ], "manager");
    expect(a).toEqual([{ at: "t", label: "Investment amount changed", source: "Fund Manager" }]);
  });
  it("removal is blocked once closed or funded", () => {
    expect(removalBlocker("closed", 0)).toBeTruthy();
    expect(removalBlocker("started", 100)).toBeTruthy();
    expect(removalBlocker("started", 0)).toBeNull();
  });
});
