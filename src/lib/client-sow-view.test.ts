import { describe, expect, it } from "vitest";
import { canReadLinkedSow, clientSowSections } from "./client-sow-view";

const entitled = { version: 2, tokenVersion: 2, approvedVersion: 2, status: "sent", accepted: false, clientId: "client-a", sowClientId: "client-a", replaced: false };
describe("client SOW link entitlement", () => {
  it("permits the same client's approved proposal version without a portal account", () => {
    expect(canReadLinkedSow(entitled)).toBe(true);
  });
  it("refuses another client's SOW", () => {
    expect(canReadLinkedSow({ ...entitled, sowClientId: "client-b" })).toBe(false);
  });
  it("refuses old versions, drafts and replaced signers", () => {
    expect(canReadLinkedSow({ ...entitled, tokenVersion: 1 })).toBe(false);
    expect(canReadLinkedSow({ ...entitled, status: "draft" })).toBe(false);
    expect(canReadLinkedSow({ ...entitled, replaced: true })).toBe(false);
  });
  it("omits internal notes and unknown sections", () => {
    expect(clientSowSections([{ key: "services", title: "Services", body: "Recorded scope" }, { key: "internal_notes", title: "Staff notes", body: "Private" }])).toEqual([{ key: "services", title: "Services", body: "Recorded scope" }]);
  });
});