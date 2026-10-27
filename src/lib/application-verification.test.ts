import { describe, expect, it } from "vitest";
import { investingPartyChecks, loadApplicationVerification } from "./application-verification";

const app = { id: "application-a", offering_id: "fund-a", kyc_status: "approved", aml_status: "approved", documents_status: "review" };
function client(links: any[], person: any, error: any = null) {
  const reads: { table: string; field: string; value: unknown }[] = [];
  return { reads, from(table: string) {
    const q: any = {
      select: () => q,
      eq: (field: string, value: unknown) => { reads.push({ table, field, value }); return q; },
      is: () => q,
      maybeSingle: async () => ({ data: person, error }),
      then: (resolve: any) => Promise.resolve({ data: links, error }).then(resolve),
    };
    return q;
  } };
}
describe("exact investing-party funding verification", () => {
  it("uses confirmed person approvals rather than stale application status", () => {
    expect(investingPartyChecks({ ...app, kyc_status: "review" }, { kyc_status: "approved", aml_status: "approved" }).kyc_status).toBe("approved");
  });
  it.each(["pending", "not_started", "review", "declined", "in_progress", "info_requested"])("does not replace %s with an old approval", (status) => {
    expect(investingPartyChecks(app, { kyc_status: status, aml_status: status })).toMatchObject({ kyc_status: status, aml_status: status });
  });
  it("never treats missing linked-person results as approved", () => {
    expect(investingPartyChecks(app, { kyc_status: null, aml_status: null }).kyc_status).toBe("not_started");
  });
  it("preserves legacy application checks only without a linked person", async () => {
    expect(await loadApplicationVerification(client([], null), app)).toEqual(app);
  });
  it("reads the explicitly linked person, not the login account", async () => {
    const db = client([{ person_id: "investor-person", offering_id: "fund-a" }], { kyc_status: "review", aml_status: "declined" });
    expect(await loadApplicationVerification(db, app)).toMatchObject({ kyc_status: "review", aml_status: "declined", documents_status: "review" });
    expect(db.reads).toContainEqual({ table: "persons", field: "id", value: "investor-person" });
    expect(db.reads.some((r) => r.field === "user_id")).toBe(false);
  });
  it.each([null, { merged_into_person_id: "other" }])("blocks missing or merged linked persons", async (person) => {
    await expect(loadApplicationVerification(client([{ person_id: "p", offering_id: "fund-a" }], person), app)).rejects.toThrow("needs review");
  });
  it("blocks failed reads rather than falling back to approval", async () => {
    await expect(loadApplicationVerification(client([], null, { message: "denied" }), app)).rejects.toThrow("couldn't confirm");
  });
  it("blocks ambiguous application links", async () => {
    await expect(loadApplicationVerification(client([{ person_id: "p", offering_id: "fund-a" }, { person_id: "q", offering_id: "fund-a" }], null), app)).rejects.toThrow("link needs review");
  });
  it("blocks conflicting fund links", async () => {
    await expect(loadApplicationVerification(client([{ person_id: "p", offering_id: "fund-b" }], null), app)).rejects.toThrow("link needs review");
  });
});