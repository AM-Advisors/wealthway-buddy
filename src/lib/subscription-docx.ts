import JSZip from "jszip";
import { fillDocx, fillXml, normKey } from "./docx-autofill";

/** Box Sign field tags for the investor (signing order 1); white so only Box's field shows. */
const BOX_TAG_RUN = (tag: string, size: number) =>
  `<w:r><w:rPr><w:color w:val="FFFFFF"/><w:sz w:val="${size}"/></w:rPr><w:t xml:space="preserve"> ${tag}</w:t></w:r>`;
export const INVESTOR_SIGNATURE_TAG = "[[s|1]]";
export const INVESTOR_DATE_TAG = "[[d|1]]";

/**
 * Fill factual signature-page labels, never signature/date evidence or legal clauses.
 * The investor's Signature and Date lines get Box Sign field tags so Box places the
 * fields itself; the fund's acceptance block keeps blank lines for the countersignature.
 */
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
  let subscriberPage = false;
  let signatureTagged = false;
  let dateTagged = false;
  const xml = (await file.async("string")).replace(/<w:p[ >][\s\S]*?<\/w:p>/g, (p) => {
    const text = [...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]).join("").replace(/&apos;|&#39;|&#x27;/gi, "'").replace(/&#x2019;|&#8217;/gi, "’");
    const key0 = normKey(text);
    if (key0 === "subscriptionamount" || key0.startsWith("subscriptionamount")) subscriberPage = true;
    if (text.includes("ACCEPTANCE OF") && (subscriberPage || signatureTagged)) acceptance = true;
    if (acceptance) {
      // Unfilled template placeholders on the fund's countersignature block stay blank lines.
      return p.replace(/\{\{[^}<]*\}\}/g, "");
    }
    if (!text.trim().endsWith(":")) return p;
    if (key0 === "signature" && !signatureTagged) {
      signatureTagged = true;
      return p.replace("</w:p>", `${BOX_TAG_RUN(INVESTOR_SIGNATURE_TAG, 48)}</w:p>`);
    }
    if (key0 === "date" && signatureTagged && !dateTagged) {
      dateTagged = true;
      return p.replace("</w:p>", `${BOX_TAG_RUN(INVESTOR_DATE_TAG, 22)}</w:p>`);
    }
    const key = fields[key0];
    const value = key ? normalized[normKey(key)] : null;
    if (!value) return p;
    const token = `<w:r><w:t xml:space="preserve"> {{${key}}}</w:t></w:r>`;
    return fillXml(p.replace("</w:p>", `${token}</w:p>`), normalized, { filled: new Set(), open: new Set() });
  });
  // Templates without an investor "Signature:" line keep their own Box tags or are prepared manually.
  zip.file("word/document.xml", xml);
  return { ...filled, bytes: await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }) };
}
