import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { fillDocx, templateTermConflicts } from "./docx-autofill";

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
    expect(r.open.sort()).toEqual(["Management Fee", "name of general partner"]);
    expect(r.xml).toContain("[name of general partner]");
  });
});

describe("recorded fund terms", () => {
  it("fills straight and curly apostrophe signatory titles across split Word runs", async () => {
    const r = await fill('<w:r><w:t>{{Signatory’s </w:t></w:r><w:r><w:t>Title}} / {{Signatory Title}} / {{Fund Manager Signatory Title}}</w:t></w:r>', { "Signatory's Title": "Managing Member", "Fund Manager Signatory Title": "Managing Member" });
    expect(r.xml?.match(/Managing Member/g)).toHaveLength(3);
    expect(r.open).toEqual([]);
  });
  it("reports the missing signatory title instead of inventing a title", async () => {
    const r = await fill('<w:r><w:t>{{Signatory’s Title}}</w:t></w:r>', { "Signatory's Title": null });
    expect(r.open).toEqual(["Signatory’s Title"]);
    expect(r.filled).toEqual([]);
  });
  it("formats percentage blanks followed by percent without doubling the unit", async () => {
    const r = await fill('<w:r><w:t>{{Management Fee}}  percent / {{Carry Amount}} percent / {{Carry Percent}}</w:t></w:r>', { "Management Fee": "6%", "Carry Amount": "15%", "Carry Percent": "15%" });
    expect(r.xml).toContain("6  percent / 15 percent / 15%");
  });
  it("keeps a conflicting no-fee clause unchanged and requires review", async () => {
    const r = await fill('<w:r><w:t>Management Fee. The Manager will not receive a management fee.</w:t></w:r>', { "Management Fee": "6%" });
    expect(r.xml).toContain("The Manager will not receive a management fee.");
    expect(r.open).toContain("Review: fixed no-management-fee clause conflicts with the recorded management fee");
  });
  it("flags the embedded advisory agreement's conflicting no-fee clause", () => {
    expect(templateTermConflicts("The Adviser will not collect a management fee.", { "Management Fee": "6%" })).toHaveLength(1);
  });
  it("requires review for Dover arbitration when recorded arbitration is Dallas, Texas", async () => {
    const r = await fill('<w:r><w:t>"Arbitration Location" means Dover, Delaware.</w:t></w:r>', { "Arbitration City": "Dallas", "Arbitration State": "Texas" });
    expect(r.xml).toContain("Dover, Delaware");
    expect(r.open).toContain("Review: fixed arbitration location conflicts with the recorded arbitration city and state");
  });
  it("does not flag matching arbitration or a recorded zero management fee", () => {
    expect(templateTermConflicts('"Arbitration Location" means Dallas, Texas. The Manager will not receive a management fee.', { "Arbitration City": "Dallas", "Arbitration State": "Texas", "Management Fee": "0%" })).toEqual([]);
  });
});