import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { fillSubscriptionDocx } from "./subscription-docx";

const para = (t: string) => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
async function docx(body: string) {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<Types/>");
  zip.file("word/document.xml", `<w:document><w:body>${body}</w:body></w:document>`);
  return zip.generateAsync({ type: "uint8array" });
}
async function xmlOf(bytes: Uint8Array) {
  return (await JSZip.loadAsync(bytes)).file("word/document.xml")!.async("string");
}

describe("subscription signature page Box fields", () => {
  it("puts the investor's Box signature and date fields on the investor page, not the fund acceptance block", async () => {
    const body = [para("Signature:"), para("Date:"), para("Subscription Amount:"), para("ACCEPTANCE OF SUBSCRIPTION"), para("Signature: {{Signature}}"), para("Date: {{Date}}")].join("");
    const xml = await xmlOf((await fillSubscriptionDocx(await docx(body), {})).bytes);
    expect(xml.match(/\[\[s\|1\]\]/g)?.length).toBe(1);
    expect(xml.match(/\[\[d\|1\]\]/g)?.length).toBe(1);
    expect(xml.indexOf("[[s|1]]")).toBeLessThan(xml.indexOf("ACCEPTANCE OF"));
    expect(xml).not.toContain("{{Signature}}");
  });
});

describe("fund countersignature placement", () => {
  it("puts the fund signatory's fields in the Acceptance of Subscription block, not on the investor's lines", async () => {
    const body = [para("Subscription Amount:"), para("Signature:"), para("Date:"), para("ACCEPTANCE OF SUBSCRIPTION"), para("Signature: {{Signature}}"), para("Date: {{Date}}")].join("");
    const xml = await xmlOf((await fillSubscriptionDocx(await docx(body), { __fund_countersigns: "1" })).bytes);
    const accept = xml.indexOf("ACCEPTANCE OF");
    expect(xml.indexOf("[[s|2]]")).toBeGreaterThan(accept);
    expect(xml.indexOf("[[d|2]]")).toBeGreaterThan(accept);
    expect(xml.indexOf("[[s|1]]")).toBeLessThan(accept);
  });
  it("adds no fund fields when the document has no countersignature", async () => {
    const body = [para("Subscription Amount:"), para("Signature:"), para("ACCEPTANCE OF SUBSCRIPTION"), para("Signature:")].join("");
    const xml = await xmlOf((await fillSubscriptionDocx(await docx(body), {})).bytes);
    expect(xml).not.toContain("[[s|2]]");
  });
});
