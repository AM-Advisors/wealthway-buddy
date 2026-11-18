/**
 * Fund intake from a shared folder: pure rules for reading folder links, sorting
 * files into fund documents vs investor forms, choosing where an approved investor
 * file goes, and grouping investor readings across files. Display and routing only;
 * saving always goes through the existing setup, document and investor engines.
 */
import type { ExtractedInvestor } from "@/lib/investor-doc-extract-model";

export type IntakeProvider = "drive" | "box";
export type FolderLink = { provider: IntakeProvider; kind: "folder" | "shared"; id: string; url: string };
export type IntakeSort = "fund" | "investor" | "skip";

export const INTAKE_MAX_FILES = 150;
export const INTAKE_BATCH = 3;
export const INTAKE_MAX_BYTES = 10 * 1024 * 1024;

/** Accepts Google Drive folder links and Box folder or shared links; anything else is null. */
export function parseFolderLink(raw: string): FolderLink | null {
  const url = String(raw ?? "").trim();
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase();
  if (host === "drive.google.com") {
    const m = u.pathname.match(/\/folders\/([A-Za-z0-9_-]{10,})/);
    const id = m?.[1] ?? (u.pathname.startsWith("/open") || u.pathname.startsWith("/drive") ? u.searchParams.get("id") : null);
    return id && /^[A-Za-z0-9_-]{10,}$/.test(id) ? { provider: "drive", kind: "folder", id, url } : null;
  }
  if (host === "box.com" || host.endsWith(".box.com") || host === "box.net" || host.endsWith(".box.net")) {
    const f = u.pathname.match(/\/folder\/(\d+)/);
    if (f) return { provider: "box", kind: "folder", id: f[1]!, url };
    const s = u.pathname.match(/\/s\/([A-Za-z0-9]{8,})/);
    if (s) return { provider: "box", kind: "shared", id: s[1]!, url: `https://app.box.com/s/${s[1]}` };
    return null;
  }
  return null;
}

const INVESTOR_WORDS = /\b(investors?|lps?|limited partners?|subscribers?|subscriptions? (docs?|signed|packets?)|kyc|aml|w-?9|w-?8|w8ben|accredit|passport|driver'?s? licen[cs]e|ids?|signed sub|k-?1)\b/i;
const FUND_WORDS = /\b(operating agreement|llc agreement|lpa|limited partnership agreement|ppm|private placement|memorandum|subscription agreement (template|form)|ein|ss-?4|cp ?575|wire instructions?|certificate of (formation|organization)|formation|term sheet|side letter template|articles)\b/i;
const SKIP = /\.(xlsx?|csv|docx?|pptx?|zip|txt|mp4|mov)$/i;

/** First guess at how to treat a file, from its folder path and name. Staff can change it. */
export function guessSort(name: string, folderPath: string | null | undefined, mime: string | null | undefined): IntakeSort {
  if (!readableType(name, mime)) return "skip";
  const n = `${folderPath ?? ""}/${name}`;
  const inInvestorFolder = /(^|\/)(investors?|lps?|limited partners?|subscribers?|subscriptions|kyc)(\/|$)/i.test(folderPath ?? "");
  if (inInvestorFolder) return "investor";
  if (FUND_WORDS.test(name)) return "fund";
  if (INVESTOR_WORDS.test(n)) return "investor";
  return "fund";
}

/** The AI readers take PDFs and photos only. */
export function readableType(name: string, mime: string | null | undefined): string | null {
  const m = String(mime ?? "").toLowerCase();
  if (["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(m)) return m;
  if (m === "application/vnd.google-apps.document") return "application/pdf";
  const n = name.toLowerCase();
  if (SKIP.test(n)) return null;
  return n.endsWith(".pdf") ? "application/pdf" : n.endsWith(".png") ? "image/png" : /\.jpe?g$/.test(n) ? "image/jpeg" : n.endsWith(".webp") ? "image/webp" : null;
}

export type InvestorFileKind = "identification" | "proof_of_address" | "accreditation_proof" | "entity_formation" | "operating_agreement" | "ownership_list" | "tax_form" | "signed_subscription" | "other";

export const INVESTOR_FILE_LABEL: Record<InvestorFileKind, string> = {
  identification: "Government ID", proof_of_address: "Proof of address", accreditation_proof: "Accreditation proof",
  entity_formation: "Entity formation", operating_agreement: "Trust or operating agreement", ownership_list: "Owner list",
  tax_form: "Signed W-9 or W-8", signed_subscription: "Signed subscription agreement", other: "Other",
};

/** Map the reader's document kind (and the file name) to where the file is filed for that investor. */
export function investorFileKind(documentKind: string | null | undefined, fileName: string): InvestorFileKind {
  const t = `${documentKind ?? ""} ${fileName}`.toLowerCase();
  if (/w-?9|w-?8|w8ben|tax form/.test(t)) return "tax_form";
  if (/subscription/.test(t)) return "signed_subscription";
  if (/passport|driver|licen[cs]e|government id|identification|\bid\b/.test(t)) return "identification";
  if (/accredit|cpa|attorney letter|brokerage|statement/.test(t)) return "accreditation_proof";
  if (/utility|proof of address|bank statement/.test(t)) return "proof_of_address";
  if (/trust|operating agreement|llc agreement/.test(t)) return "operating_agreement";
  if (/formation|articles|certificate of/.test(t)) return "entity_formation";
  if (/owner|beneficial/.test(t)) return "ownership_list";
  return "other";
}

/**
 * Where an approved investor file is saved. Signed subscriptions (and signed tax forms on
 * migration funds) are recorded as earlier signed copies; other files go to the investor's
 * uploads for review. Nothing here marks anything verified, signed or funded.
 */
export function investorFileDestination(kind: InvestorFileKind, migration: boolean): { to: "prior_signed"; priorKind: "subscription_agreement" | "tax_form" | "accreditation" | "other" } | { to: "upload"; uploadKind: Exclude<InvestorFileKind, "signed_subscription" | "other"> } | { to: "none" } {
  if (kind === "signed_subscription") return { to: "prior_signed", priorKind: "subscription_agreement" };
  if (kind === "tax_form" && migration) return { to: "prior_signed", priorKind: "tax_form" };
  if (kind === "other") return migration ? { to: "prior_signed", priorKind: "other" } : { to: "none" };
  return { to: "upload", uploadKind: kind };
}

export type InvestorGroup = { key: string; investor: ExtractedInvestor; files: { fileId: string; fileName: string; kind: InvestorFileKind }[] };

const norm = (v: unknown) => String(v ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9@.]+/g, " ").trim();
export function investorKey(i: Pick<ExtractedInvestor, "email" | "entityName" | "firstName" | "lastName">): string {
  if (i.entityName) return `e:${norm(i.entityName)}`;
  if (i.email) return `m:${norm(i.email)}`;
  return `p:${norm(i.firstName).split(" ")[0] ?? ""}|${norm(i.lastName).split(" ").at(-1) ?? ""}`;
}

/** Same email, same entity name, or same first and last name across files become one row; earlier files win, later fill blanks. */
export function groupInvestors(readings: { fileId: string; fileName: string; documentKind: string; investors: ExtractedInvestor[] }[]): InvestorGroup[] {
  const out: InvestorGroup[] = [];
  const same = (a: ExtractedInvestor, b: ExtractedInvestor) =>
    (!!a.email && !!b.email && norm(a.email) === norm(b.email))
    || (!!a.entityName && !!b.entityName && norm(a.entityName) === norm(b.entityName))
    || (!a.entityName && !b.entityName && !!a.lastName && investorKey(a) === investorKey(b));
  for (const r of readings) {
    const kind = investorFileKind(r.documentKind, r.fileName);
    for (const inv of r.investors) {
      if (!inv.firstName && !inv.lastName && !inv.entityName && !inv.email) continue;
      const g = out.find((x) => same(x.investor, inv));
      if (!g) { out.push({ key: investorKey(inv), investor: { ...inv }, files: [{ fileId: r.fileId, fileName: r.fileName, kind }] }); continue; }
      for (const k of Object.keys(inv) as (keyof ExtractedInvestor)[]) if (g.investor[k] == null && inv[k] != null) (g.investor as any)[k] = inv[k];
      if (!g.files.some((f) => f.fileId === r.fileId)) g.files.push({ fileId: r.fileId, fileName: r.fileName, kind });
    }
  }
  return out;
}

export function amountToCents(raw: string | null | undefined): number | null {
  const s = String(raw ?? "").replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Math.round(Number(s) * 100);
  return n > 0 ? n : null;
}
