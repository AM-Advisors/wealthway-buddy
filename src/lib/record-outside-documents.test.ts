import { describe, expect, it } from "vitest";
import { outsideDocsForRecord } from "./record-outside-documents";

const sub = { id: "a", kind: "subscription_agreement", replaced: false, withdrawn: false };

describe("outsideDocsForRecord", () => {
  it("shows an outside-signed subscription agreement when the fund has no signature documents", () => {
    expect(outsideDocsForRecord([sub], []).map((d) => d.id)).toEqual(["a"]);
  });
  it("hides it when a fund subscription agreement already shows it as signed outside", () => {
    expect(outsideDocsForRecord([sub], [{ docType: "subscription_agreement", outsideSigned: { signedOn: "2023-09-05" } }])).toEqual([]);
  });
  it("still shows it when the matching fund document is not marked signed outside", () => {
    expect(outsideDocsForRecord([sub], [{ docType: "subscription_agreement", outsideSigned: null }]).length).toBe(1);
  });
  it("leaves out replaced and undone copies", () => {
    expect(outsideDocsForRecord([{ ...sub, replaced: true }, { ...sub, id: "b", withdrawn: true }], [])).toEqual([]);
  });
});
