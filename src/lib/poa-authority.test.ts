import { describe, expect, it } from "vitest";
import {
  POA_KEEPS_WITH_OWNER,
  POA_NEVER_CAPABILITIES,
  poaAuthorityLevel,
  poaAuthorityView,
  poaCapabilities,
  poaCoveredTypesBlocker,
  poaNeverGrantedHolds,
  poaPlainPowers,
} from "./poa-authority";
import { POA_POWERS } from "./power-of-attorney-model";

const record = (over: Partial<{ status: string; effective_on: string; expires_on: string | null; agent_user_id: string | null }> = {}) => ({
  status: "accepted", effective_on: "2026-01-01", expires_on: null, agent_user_id: "agent-1", ...over,
});
const grant = (over: Partial<{ status: string; revoked_at: string | null; effective_at: string | null; expires_at: string | null; acceptance_state: string }> = {}) => ({
  status: "active", revoked_at: null, effective_at: "2026-01-01T00:00:00Z", expires_at: null, acceptance_state: "accepted", ...over,
});
const now = new Date("2026-06-01T12:00:00Z");

describe("power of attorney authority", () => {
  it("a read-only banking summary is all banking matters ever opens", () => {
    expect(poaCapabilities(["banking_matters"])).toEqual(["view_banking_info"]);
  });

  it("signing lists only the delegated signing permission", () => {
    expect(poaCapabilities(["sign_documents"])).toEqual(["sign_specified_documents"]);
  });

  it("tax matters opens tax work, and nothing that moves money", () => {
    const caps = poaCapabilities(["tax_matters"]);
    expect(caps).toContain("prepare_individual_return");
    expect(caps).toContain("view_tax_returns");
    expect(caps).not.toContain("initiate_investment");
    expect(caps).not.toContain("view_wire_instructions");
  });

  it("powers the platform cannot describe open nothing", () => {
    expect(poaCapabilities(["other"])).toEqual([]);
    expect(poaCapabilities([])).toEqual([]);
    expect(poaCapabilities(["made_up_power"])).toEqual([]);
  });

  it("money, wire and approval permissions are unreachable from any combination of powers", () => {
    expect(poaNeverGrantedHolds(POA_POWERS)).toBe(true);
    const all = poaCapabilities(POA_POWERS);
    for (const blocked of POA_NEVER_CAPABILITIES) expect(all).not.toContain(blocked);
  });

  it("the authority level is the highest the listed powers need", () => {
    expect(poaAuthorityLevel(["provide_information"])).toBe("assist");
    expect(poaAuthorityLevel(["banking_matters"])).toBe("limited_proxy");
    expect(poaAuthorityLevel(["sign_documents"])).toBe("authorized_signatory");
    expect(poaAuthorityLevel(["other"])).toBeNull();
  });

  it("signing needs the document to name what it covers", () => {
    expect(poaCoveredTypesBlocker(["sign_documents"], [])).toBe("Say which document types the power of attorney lets them sign.");
    expect(poaCoveredTypesBlocker(["sign_documents"], ["subscription_agreement"])).toBeNull();
    expect(poaCoveredTypesBlocker(["tax_matters"], ["tax_form"])).toBe("Document types are only needed when signing is one of the powers.");
    expect(poaCoveredTypesBlocker(["sign_documents"], ["not_a_document"])).toBe("Choose a document type from the listed ones.");
  });

  it("nothing is open before Harmonious accepts the document", () => {
    const v = poaAuthorityView(record({ status: "pending_review" }), null, now);
    expect(v.state).toBe("no_record");
    expect(v.label).toBe("Waiting for Harmonious review");
  });

  it("an unlinked name opens nothing even after acceptance", () => {
    const v = poaAuthorityView(record({ agent_user_id: null }), null, now);
    expect(v.state).toBe("not_linked");
    expect(v.label).toBe("Not linked to an account yet");
  });

  it("the named person accepting is what opens the grant", () => {
    expect(poaAuthorityView(record(), grant({ acceptance_state: "awaiting_acceptance" }), now).label).toBe("Waiting for them to accept");
    expect(poaAuthorityView(record(), grant(), now).state).toBe("active");
  });

  it("a revoked or expired grant ends immediately", () => {
    expect(poaAuthorityView(record(), grant({ revoked_at: "2026-05-01T00:00:00Z" }), now).label).toBe("Ended");
    expect(poaAuthorityView(record(), grant({ expires_at: "2026-05-01T00:00:00Z" }), now).state).toBe("ended");
    expect(poaAuthorityView(record({ status: "revoked" }), grant(), now).label).toBe("Ended");
  });

  it("a grant dated for the future has not started", () => {
    const v = poaAuthorityView(record({ effective_on: "2026-09-01" }), grant({ effective_at: "2026-09-01T00:00:00Z" }), now);
    expect(v.state).toBe("starts_later");
    expect(v.detail).toContain("Opens on");
  });

  it("the plain words shown on screen name the powers and the limits note", () => {
    const lines = poaPlainPowers(["tax_matters", "other"], "Only for the Erebor subscription");
    expect(lines[0]).toContain("tax paperwork");
    expect(lines.some((l) => l.includes("Only for the Erebor subscription"))).toBe(true);
  });

  it("the card always states what stays with the account holder", () => {
    expect(POA_KEEPS_WITH_OWNER.some((l) => l.includes("bank or wire details"))).toBe(true);
    expect(POA_KEEPS_WITH_OWNER.some((l) => l.includes("identity check"))).toBe(true);
  });
});
