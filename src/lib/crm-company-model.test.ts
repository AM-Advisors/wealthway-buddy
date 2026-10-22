import { describe, expect, it } from "vitest";
import { companyContacts, contactFields } from "./crm-company-model";
import type { CrmActor } from "./crm-model";

const actor: CrmActor = { userId: "rep", superUser: false, viewAll: false, canAssign: false, canApproveCampaigns: false, harmoniousStaff: true, managedFunds: new Set() };
describe("CRM company connections", () => {
  it("saves client titles and phone numbers", () => {
    expect(contactFields({ full_name: "Fictional Contact", title: " CEO ", phone: " +1 202 555 0100 " })).toMatchObject({ title: "CEO", phone: "+1 202 555 0100" });
  });
  it("allows updating and clearing title and phone", () => {
    expect(contactFields({ full_name: "Fictional Contact", title: "CFO", phone: "+1 202 555 0101" })).toMatchObject({ title: "CFO", phone: "+1 202 555 0101" });
    expect(contactFields({ full_name: "Fictional Contact", title: "", phone: "" })).toMatchObject({ title: null, phone: null });
  });
  it("connects different contacts while preserving each contact's visibility", () => {
    const row = { scope: "harmonious" as const, offering_id: null, owner_user_id: "rep", company_id: "company" };
    const contacts = [{ ...row, id: "one" }, { ...row, id: "two" }, { ...row, id: "private", owner_user_id: "other" }, { ...row, id: "unrelated", company_id: "different" }];
    expect(companyContacts(actor, "company", contacts).map((r) => r.id)).toEqual(["one", "two"]);
  });
});