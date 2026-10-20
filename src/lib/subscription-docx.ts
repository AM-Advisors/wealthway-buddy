import JSZip from "jszip";
import { fillDocx, fillXml, normKey } from "./docx-autofill";

/** Fill factual signature-page labels, never signature/date evidence or legal clauses. */
export async function fillSubscriptionDocx(bytes: Uint8Array, values: Record<string, string | null | undefined>) {
  const filled = await fillDocx(bytes, values);
  const zip = await JSZip.loadAsync(filled.bytes);
  const file = zip.file("word/document.xml");
  if (!file) throw new Error("The agreement has no Word document content.");
  const fields: Record<string, string> = {
    "subscriptionamount": "Investor Subscription Amount",
    "subscriberlegalname": "Subscriber Legal Name",
    "signatorylegalname": "Investor Signer Name",
    "signatorytitle": "Investor Signer Title",
  };
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) if (value?.trim()) normalized[normKey(key)] = value.trim();
  let acceptance = false;
  const xml = (await file.async("string")).replace(/<w:p[ >][\s\S]*?<\/w:p>/g, (p) => {
    const text = [...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]).join("").replace(/&apos;|&#39;|&#x27;/gi, "'").replace(/&#x2019;|&#8217;/gi, "’");
    if (text.includes("ACCEPTANCE OF")) acceptance = true;
    if (acceptance || !text.trim().endsWith(":")) return p;
    const key = fields[normKey(text)];
    const value = key ? normalized[normKey(key)] : null;
    if (!value) return p;
    const token = `<w:r><w:t xml:space="preserve"> {{${key}}}</w:t></w:r>`;
    return fillXml(p.replace("</w:p>", `${token}</w:p>`), normalized, { filled: new Set(), open: new Set() });
  });
  zip.file("word/document.xml", xml);
  return { ...filled, bytes: await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }) };
}