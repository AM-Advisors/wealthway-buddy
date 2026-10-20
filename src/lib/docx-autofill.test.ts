import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { fillDocx } from "./docx-autofill";

async function fill(text: string, values: Record<string, string | null>) {
  const zip = new JSZip();
  zip.file("word/document.xml", `<w:document><w:p>${text}</w:p></w:document>`);
  const result = await fillDocx(await zip.generateAsync({ type: "uint8array" }), values);
  const output = await JSZip.loadAsync(result.bytes);
  return { ...result, xml: await output.file("word/document.xml")?.async("string") };
}

describe("publisher identity autofill", () => {
  it("fills a split publisher fund-name blank from the legal fund name", async () => {
    const r = await fill('<w:r><w:t>[NAME OF </w:t></w:r><w:r><w:t>FUND]</w:t></w:r>', { "Fund Legal Name": "Example Equity LP" });
    expect(r.xml).toContain("Example Equity LP");
    expect(r.filled).toEqual(["NAME OF FUND"]);
  });
  it("keeps the general partner separate from the fund manager", async () => {
    const r = await fill('<w:r><w:t>[name of general partner] / [name of fund manager]</w:t></w:r>', { "General Partner Name": "Example GP LLC", "Fund Manager Name": "Example Manager LLC" });
    expect(r.xml).toContain("Example GP LLC / Example Manager LLC");
  });
  it("does not fill investor identity, optional clauses, dates or jurisdiction choices", async () => {
    const text = "[name of investor] [Delaware limited liability company] [__] [and adviser]";
    const r = await fill(`<w:r><w:t>${text}</w:t></w:r>`, { "name of investor": "Wrong Investor", "Delaware limited liability company": "New York LLC" });
    expect(r.xml).toContain(text);
    expect(r.filled).toEqual([]);
  });
  it("retains missing fund details and reports them for review", async () => {
    const r = await fill('<w:r><w:t>[name of general partner] {{Management Fee}}</w:t></w:r>', { "General Partner Name": null });
    expect(r.open).toEqual(["name of general partner", "Management Fee"]);
    expect(r.xml).toContain("[name of general partner]");
  });
});