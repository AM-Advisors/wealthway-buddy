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

/** Guidance only: never records completion, verification, signatures or funding. */
export const PACKET_ONBOARDING_STEPS = [
  { title: "1. About You", text: "Enter the investing party's legal name, subscription amount and applicable details in the Subscriber Information Form or your portal. For a trust or company, keep the entity's details separate from each trustee, owner and signer. Reuse details already on file and complete anything missing." },
  { title: "2. Verification", text: "Complete the identity and eligibility checks requested in your portal, including any applicable accreditation evidence. Provide sensitive identifiers and supporting documents through the secure portal, not ordinary email. Paper answers and checklist ticks do not replace these checks." },
  { title: "3. Sign", text: "Read the fund documents, check every answer and sign the documents marked Sign. Complete, sign and date only the tax form that applies to the investing party. Leave fund manager signature and acceptance sections blank. Your portal shows any details or reviews still needed before signing." },
  { title: "4. Fund", text: "Follow the wire instructions released for your investment only when your portal allows funding. Confirm bank details by phone using a number you already have. Sending money does not replace missing information, verification or signatures." },
] as const;

export type PacketChecklistItem = { targetKey: string; title: string; action: string };
export function packetChecklist(docs: PacketDocInput[]): PacketChecklistItem[] {
  return [
    { targetKey: "subscriber-information", title: "Subscriber Information Form: complete all applicable answers", action: "Complete" },
    { targetKey: "onboarding-instructions", title: "Verification: complete the checks requested in your secure portal", action: "Portal" },
    ...docs.map((d) => ({ targetKey: d.versionId, title: d.title, action: sectionFor(d).action })),
    { targetKey: "tax-forms", title: "Tax forms: complete, sign and date one applicable form only", action: "Complete one" },
  ];
}
