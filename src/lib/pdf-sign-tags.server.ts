import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getDocumentProxy } from "unpdf";

/** Box Sign text tags: Box turns these into locked fields for the given signer order. */
const TAGS = { investorSign: "[[s|1]]", investorDate: "[[d|1]]", fundSign: "[[s|2]]", fundDate: "[[d|2]]" } as const;

type Item = { str: string; x: number; y: number; w: number };
type Page = { index: number; text: string; items: Item[] };

export type SignPlacement = { tag: string; pageIndex: number; x: number; y: number; size: number };

const isPdf = (b: Uint8Array) => b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46;

/**
 * Pure placement: picks the investor's signature page (Individuals or Entities)
 * and the fund's acceptance page, and puts each signer's tag on its own line only.
 */
export function planSignPlacements(pages: Page[], opts: { investorIsEntity: boolean; fundCountersigns: boolean }): SignPlacement[] {
  const sigPages = pages.filter((p) => /SIGNATURE PAGE/i.test(p.text));
  const pick = (re: RegExp) => sigPages.find((p) => re.test(p.text));
  const investorPage =
    (opts.investorIsEntity ? pick(/\bENTIT(Y|IES)\b/) : pick(/\bINDIVIDUALS?\b/)) ??
    sigPages.find((p) => !/ACCEPTANCE/i.test(p.text)) ??
    pages.find((p) => p.items.some((i) => /\bSignature\b/.test(i.str)) && !/ACCEPTANCE/i.test(p.text));
  const out: SignPlacement[] = [];
  const place = (page: Page, sign: string, date: string) => {
    const label = page.items.find((i) => /\bSignature\b/.test(i.str));
    if (!label) return false;
    out.push({ tag: sign, pageIndex: page.index, x: label.x, y: label.y + 14, size: 14 });
    const d = page.items.find((i) => /^\s*Date\b/.test(i.str));
    if (d) out.push({ tag: date, pageIndex: page.index, x: d.x + d.w + 12, y: d.y + 2, size: 10 });
    return true;
  };
  if (!investorPage || !place(investorPage, TAGS.investorSign, TAGS.investorDate)) return [];
  if (opts.fundCountersigns) {
    const fundPage = pages.find((p) => p.index > investorPage.index && /ACCEPTANCE/i.test(p.text)) ?? pages.find((p) => /ACCEPTANCE/i.test(p.text));
    if (fundPage) place(fundPage, TAGS.fundSign, TAGS.fundDate);
  }
  return out;
}

/** Stamps invisible Box Sign tags on a PDF so Box guides each signer to their own line. */
export async function tagPdfSignatureLines(bytes: Uint8Array, opts: { investorIsEntity: boolean; fundCountersigns: boolean }): Promise<{ bytes: Uint8Array; tagged: boolean }> {
  if (!isPdf(bytes)) return { bytes, tagged: false };
  try {
    const proxy = await getDocumentProxy(new Uint8Array(bytes));
    const pages: Page[] = [];
    for (let i = 1; i <= proxy.numPages; i++) {
      const page = await proxy.getPage(i);
      const content = await page.getTextContent();
      const items = (content.items as any[]).filter((it) => typeof it.str === "string" && it.str.trim()).map((it) => ({ str: it.str as string, x: it.transform[4] as number, y: it.transform[5] as number, w: Number(it.width ?? 0) }));
      pages.push({ index: i - 1, text: items.map((t) => t.str).join(" "), items });
    }
    const plan = planSignPlacements(pages, opts);
    if (!plan.length) return { bytes, tagged: false };
    const doc = await PDFDocument.load(bytes);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (const p of plan) {
      doc.getPage(p.pageIndex).drawText(p.tag, { x: p.x, y: p.y, size: p.size, font, color: rgb(1, 1, 1) });
    }
    return { bytes: await doc.save(), tagged: true };
  } catch {
    return { bytes, tagged: false };
  }
}
