import { describe, expect, it } from "vitest";
import { signingFileName, sniffDocumentKind } from "./box.server";

const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
const docx = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);

describe("Box signing file type", () => {
  it("names Word bytes .docx even when the stored name says .pdf", () => {
    expect(signingFileName("Subscription Agreement - Calvin.pdf", docx, 0)).toBe("Subscription Agreement - Calvin - 0.docx");
  });
  it("names PDF bytes .pdf", () => {
    expect(sniffDocumentKind(pdf)).toBe("pdf");
    expect(signingFileName("PPM", pdf, 0).endsWith(".pdf")).toBe(true);
  });
  it("gives each upload a distinct name so an earlier request's file is never overwritten", () => {
    expect(signingFileName("Agreement", pdf, 1)).not.toBe(signingFileName("Agreement", pdf, 2));
  });
  it("refuses bytes that are neither PDF nor Word", () => {
    expect(() => sniffDocumentKind(new Uint8Array([1, 2, 3, 4]))).toThrow();
  });
});
