import { describe, expect, it } from "vitest";
import { planSync, wixContact } from "./wix-contact-sync-model";

const w = (p: any) => ({ wixId: p.id, fullName: p.full ?? null, entityName: p.entity ?? null, email: p.email ?? null, details: p.details ?? {} });
const h = (p: any) => ({ onboardingId: p.id, personId: "p" + p.id, firstName: p.first ?? null, lastName: p.last ?? null, profileName: p.profile ?? null, person: p.person ?? {} });

describe("wix contact sync", () => {
  it("splits a Wix address and phone", () => {
    const c = wixContact(w({ id: "1", details: { investorsPhone: "7024989986", physicalAddress: "9332 Provence Garden Ln, Las Vegas, NV 89145, USA" } }));
    expect(c).toMatchObject({ phone: "7024989986", line1: "9332 Provence Garden Ln", city: "Las Vegas", region: "NV", postal: "89145", country: "United States" });
  });
  it("matches by name and fills only blanks", () => {
    const r = planSync([h({ id: "a", first: "Marwan", last: "Takieddine", person: { phone: "111" } })], [w({ id: "x", full: "Marwan Takieddine", email: "m@x.com", details: { investorsPhone: "7024989986" } })]);
    expect(r.rows[0]!.fills.map((f) => f.field)).toEqual(["email"]);
  });
  it("matches entities by entity name", () => {
    const r = planSync([h({ id: "a", profile: "Votrian, LP" })], [w({ id: "x", full: "Harrison Read", entity: "Votrian, LP", email: "h@r.com" })]);
    expect(r.rows[0]!.fills[0]).toMatchObject({ field: "email", value: "h@r.com" });
  });
  it("skips ambiguous name matches", () => {
    const r = planSync([h({ id: "a", first: "Jon", last: "Scott" })], [w({ id: "x", full: "Jon Scott" }), w({ id: "y", full: "Jon  Scott" })]);
    expect(r.rows).toHaveLength(0);
  });
});
