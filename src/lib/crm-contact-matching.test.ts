import { describe, expect, it } from "vitest";
import { groupVisibleContacts, matchingVisibleContacts, importedContactFields } from "./crm-contact-matching";
const actor = { userId: "rep", superUser: false, viewAll: false, canAssign: false, canApproveCampaigns: false, harmoniousStaff: true, managedFunds: new Set<string>() };
const contact = { id: "one", scope: "harmonious" as const, offering_id: null, owner_user_id: "rep", email: " Contact@Example.test ", consent: "opted_in", tags: ["clickup"] };
describe("shared entitled CRM contacts", () => {
  it("shows one contact for normalized matching emails", () => {
    const rows = groupVisibleContacts(actor, [contact, { ...contact, id: "two", email: "contact@example.test", tags: ["hubspot"] }]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.matchedContactIds).toEqual(["one", "two"]);
    expect(rows[0]?.tags).toEqual(["clickup", "hubspot"]);
  });
  it("shared history never includes an unentitled contact", () => {
    expect(matchingVisibleContacts(actor, contact, [contact, { ...contact, id: "private", owner_user_id: "another" }]).map(r => r.id)).toEqual(["one"]);
  });
  it("does not combine unrelated fund scopes or missing emails", () => {
    expect(groupVisibleContacts({ ...actor, superUser: true }, [contact, { ...contact, id: "fund", scope: "fund", offering_id: "fund" }, { ...contact, id: "none", email: null }])).toHaveLength(3);
  });
  it("an unsubscribe wins over imported opt-in", () => {
    expect(groupVisibleContacts(actor, [contact, { ...contact, id: "two", consent: "unsubscribed" }])[0]?.consent).toBe("unsubscribed");
  });
  it("another source fills blanks without replacing local details", () => {
    expect(importedContactFields({ full_name: "Recorded Name", phone: null, external_source: "clickup" }, { full_name: "Incoming Name", phone: "555-0100" }, "hubspot")).toEqual({ phone: "555-0100" });
  });
});