import { expect, it } from "vitest";
import JSZip from "jszip";
import { fillSubscriptionDocx } from "./subscription-docx";

it("fills each investor's amount separately from the fund minimum and never signs", async () => {
  const zip = new JSZip();
  zip.file("word/document.xml", `<w:document><w:p><w:r><w:t>ACCEPTANCE OF SUBSCRIPTION (table of contents)</w:t></w:r></w:p><w:p><w:r><w:t>Minimum: {{Subscription Amount}}</w:t></w:r></w:p><w:p><w:r><w:t>Subscription Amount:</w:t></w:r></w:p><w:p><w:r><w:t>Subscriber's Legal Name:</w:t></w:r></w:p><w:p><w:r><w:t>Signature:</w:t></w:r></w:p><w:p><w:r><w:t>ACCEPTANCE OF</w:t></w:r></w:p><w:p><w:r><w:t>Signatory’s Legal Name:</w:t></w:r></w:p></w:document>`);
  const r = await fillSubscriptionDocx(await zip.generateAsync({ type: "uint8array" }), { "Subscription Amount": "$25,000.00", "Investor Subscription Amount": "$500,000.00", "Subscriber Legal Name": "Calvin Jung", "Investor Signer Name": "Calvin Jung" });
  const out = await JSZip.loadAsync(r.bytes);
  const xml = await out.file("word/document.xml")?.async("string");
  expect(xml).toContain("Minimum: $25,000.00");
  expect(xml).toContain("$500,000.00");
  expect(xml?.match(/Calvin Jung/g)).toHaveLength(1);
  expect(xml).toContain("<w:t>Signature:</w:t>");
  expect(xml).toContain("<w:t>Signatory’s Legal Name:</w:t>");
});
it("refuses to send an agreement where the investor would have to place their own signature", async () => {
  const zip = new JSZip();
  zip.file("word/document.xml", `<w:document><w:p><w:r><w:t>No signature lines here</w:t></w:r></w:p></w:document>`);
  await expect(fillSubscriptionDocx(await zip.generateAsync({ type: "uint8array" }), {})).rejects.toThrow(/signature line/);
});
