/**
 * Subscription packet: pure rules for which fund documents go in, in what order,
 * and what the divider page tells the investor. The PDF lives in subscription-packet.server.ts.
 */
export type PacketDocInput = {
  versionId: string; title: string; docType: string | null; category: string | null; usage: string | null;
  approvalStatus: string | null; supersededAt: string | null; removedAt?: string | null; fileName: string | null;
};
export type PacketSection = { key: string; title: string; action: string; notes: string[] };

const ORDER = ["ppm", "operating_agreement", "subscription_agreement", "side_letter"];
const kindOf = (d: PacketDocInput) => {
  const k = String(d.category || d.docType || "").toLowerCase();
  return ORDER.find((o) => k.includes(o)) ?? "other";
};
/** Investor-facing kinds only; identity, tax, bank and signed copies never enter the packet. */
const EXCLUDED = /(kyc|identity|passport|bank|wire|tax|w-?9|w-?8|statement|signed|formation|ein|certificate)/i;

export function selectPacketDocuments(docs: PacketDocInput[], sealed: Set<string>) {
  const included: PacketDocInput[] = [];
  const missing: string[] = [];
  for (const d of docs) {
    if (d.removedAt || sealed.has(d.versionId)) continue;
    if (EXCLUDED.test(`${d.category ?? ""} ${d.docType ?? ""}`)) continue;
    if (d.approvalStatus !== "approved" || d.supersededAt || !d.fileName) { missing.push(d.title); continue; }
    included.push(d);
  }
  included.sort((a, b) => (ORDER.indexOf(kindOf(a)) + 1 || 99) - (ORDER.indexOf(kindOf(b)) + 1 || 99));
  return { included, missing };
}

export function sectionFor(d: PacketDocInput): PacketSection {
  const k = kindOf(d);
  const sign = d.usage === "signature";
  if (k === "ppm") return { key: k, title: d.title, action: "Read and keep", notes: [
    "Explains the fund, its investment, fees, risks and tax matters.",
    "Nothing to sign in this document. You confirm you received and read it on the Subscriber Information Form.",
    "Pay close attention to the sections on risks." ] };
  if (k === "operating_agreement") return { key: k, title: d.title, action: sign ? "Sign" : "Read and keep", notes: [
    "The fund's governing agreement: members' rights, distributions, fees and carry.",
    sign ? "Sign where your name appears." : "You do not sign this directly. Your Subscription Agreement signature also counts as your signature on this agreement.",
    "Signature lines for the fund manager are completed by the fund." ] };
  if (k === "subscription_agreement") return { key: k, title: d.title, action: "Sign", notes: [
    "Your agreement to buy an interest in the fund. Read all of it before signing.",
    "On the investor signature page, fill in: signature, date, subscription amount, the investor's legal name, and the signer's name and title.",
    "The Acceptance of Subscription is completed by the fund manager. Leave it blank." ] };
  if (k === "side_letter") return { key: k, title: d.title, action: sign ? "Sign" : "Read and keep", notes: [
    "Investor-specific terms that apply only where your side letter says so.",
    "Everything not changed by the side letter follows the Operating Agreement." ] };
  return { key: k, title: d.title, action: sign ? "Sign" : "Read and keep", notes: ["Part of the fund's investor documents. Read and keep a copy."] };
}

export const TAX_FORMS = [
  { key: "fw9", label: "Form W-9", who: "U.S. individuals, trusts and companies." },
  { key: "fw8ben", label: "Form W-8BEN", who: "Individuals who are not U.S. persons." },
  { key: "fw8bene", label: "Form W-8BEN-E", who: "Companies and other entities that are not U.S. persons." },
] as const;
