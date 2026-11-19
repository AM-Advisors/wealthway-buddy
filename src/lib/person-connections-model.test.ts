import { describe, expect, it } from "vitest";
import { belongsTo, buildPersonConnections } from "@/lib/person-connections-model";

const id = { userId: "u1", personIds: ["p1"], emails: ["bonnie.huggins@corpscapadvisors.com"] };
const empty = { memberships: [], contacts: [], clientInvites: [], managers: [], team: [], grants: [], fundInvites: [], onboardings: [] };

describe("person connections", () => {
  it("matches the same person by login, person record or any address on file, case-insensitive", () => {
    expect(belongsTo(id, { userId: "u1" })).toBe(true);
    expect(belongsTo(id, { personId: "p1" })).toBe(true);
    expect(belongsTo(id, { email: " Bonnie.Huggins@CorpsCapAdvisors.com " })).toBe(true);
  });

  it("never claims a row that names another login or person, even with the same email", () => {
    expect(belongsTo(id, { userId: "u2", email: "bonnie.huggins@corpscapadvisors.com" })).toBe(false);
    expect(belongsTo(id, { personId: "p9", email: "bonnie.huggins@corpscapadvisors.com" })).toBe(false);
  });

  it("keeps login access separate from a contact listing on the same client", () => {
    const c = buildPersonConnections(id, {
      ...empty,
      contacts: [{ id: "c1", client_id: "k1", email: "bonnie.huggins@corpscapadvisors.com", designations: ["finance"], status: "active", clients: { name: "Corps" } }],
    });
    expect(c.clients).toHaveLength(1);
    expect(c.clients[0]!.access).toBeNull();
    expect(c.clients[0]!.listedAs).toEqual(["finance"]);
  });

  it("ignores revoked memberships, deactivated contacts and removed team entries", () => {
    const c = buildPersonConnections(id, {
      ...empty,
      memberships: [{ id: "m1", client_id: "k1", user_id: "u1", client_role: "client_gp", revoked_at: "2026-01-01" }],
      contacts: [{ id: "c1", client_id: "k2", user_id: "u1", status: "active", deactivated_at: "2026-01-01" }],
      team: [{ offering_id: "f1", user_id: "u1", team_role: "gp", removed_at: "2026-01-01" }],
    });
    expect(c.clients).toHaveLength(0);
    expect(c.funds).toHaveLength(0);
  });

  it("joins manager, team entry and team access for one fund into a single row", () => {
    const c = buildPersonConnections(id, {
      ...empty,
      managers: [{ offering_id: "f1", user_id: "u1", offerings: { name: "Corps Erebor" } }],
      team: [{ offering_id: "f1", email: "bonnie.huggins@corpscapadvisors.com", team_role: "operations" }],
      grants: [{ offering_id: "f1", grantee_user_id: "u1", role: "fund_viewer", status: "active" }],
    });
    expect(c.funds).toHaveLength(1);
    expect(c.funds[0]).toMatchObject({ manager: true, teamRoles: ["operations"], teamAccess: ["fund_viewer"] });
  });

  it("excludes removed and merged investments", () => {
    const c = buildPersonConnections(id, {
      ...empty,
      onboardings: [
        { id: "o1", offering_id: "f1", person_id: "p1", funded_amount_cents: 0 },
        { id: "o2", offering_id: "f1", person_id: "p1", removed_at: "2026-01-01" },
        { id: "o3", offering_id: "f2", investor_user_id: "u1", merged_into_onboarding_id: "o1" },
      ],
    });
    expect(c.investments.map((i) => i.id)).toEqual(["o1"]);
  });
});
