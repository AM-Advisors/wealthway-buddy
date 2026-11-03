import { describe, expect, it } from "vitest";
import { assertUnsealedVersion } from "./sealed-records.server";

function database(recordId: string | null, failed = false) {
  return { from: () => ({ select: () => ({ eq: async () => ({
    data: recordId ? [{ record_id: recordId }] : [], error: failed ? new Error("denied") : null,
  }) }) }) };
}

describe("sealed version download protection", () => {
  it("refuses direct access to the original Erebor PPM", async () => {
    const id = "bdd85c2f-c015-4ea3-9506-d49093a92cd2";
    await expect(assertUnsealedVersion(database(id), "offering_document_versions", id)).rejects.toThrow("no longer available");
  });
  it("refuses the original shared PPM template", async () => {
    const id = "875525db-a429-4c78-a6b8-9a82282d7cd7";
    await expect(assertUnsealedVersion(database(id), "document_template_versions", id)).rejects.toThrow("no longer available");
  });
  it("allows the current unsealed Erebor PPM", async () => {
    await expect(assertUnsealedVersion(database("bdd85c2f-c015-4ea3-9506-d49093a92cd2"), "offering_document_versions", "5207fb3b-4d3d-4a41-ab2e-2ebfccab63bd")).resolves.toBeUndefined();
  });
  it("does not allow downloads when archive checks fail", async () => {
    await expect(assertUnsealedVersion(database(null, true), "document_template_versions", "875525db-a429-4c78-a6b8-9a82282d7cd7")).rejects.toThrow();
  });
});