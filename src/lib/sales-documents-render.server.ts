/** Branded PDF and Word exports for Sales documents. Server-only. */
import type { Section } from "@/lib/sales-documents-model";
import { KIND_LABEL, type DocKind } from "@/lib/sales-documents-model";

const NAVY = { r: 0x14 / 255, g: 0x26 / 255, b: 0x47 / 255 };
const TEAL = { r: 0x5d / 255, g: 0xc6 / 255, b: 0xd1 / 255 };
const INK = { r: 0x22 / 255, g: 0x1f / 255, b: 0x20 / 255 };

const clean = (s: string) => s.replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, (c) => ({ "\u2018": "'", "\u2019": "'", "\u201C": '"', "\u201D": '"', "\u2013": "-", "\u2014": "-", "\u2022": "-", "\u2026": "..." } as Record<string, string>)[c] ?? "");

export async function renderPdf(doc: any, sections: Section[], draft: boolean): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 612, H = 792, M = 56, maxW = W - M * 2;
  let page = pdf.addPage([W, H]); let y = H - M;
  const footer = (p: any) => {
    p.drawRectangle({ x: 0, y: 0, width: W, height: 28, color: rgb(NAVY.r, NAVY.g, NAVY.b) });
    p.drawText("Harmonious  |  harmonious.co", { x: M, y: 10, size: 8, font: reg, color: rgb(1, 1, 1) });
    if (draft) p.drawText("DRAFT - not approved", { x: W - M - 100, y: 10, size: 8, font: bold, color: rgb(TEAL.r, TEAL.g, TEAL.b) });
  };
  const newPage = () => { footer(page); page = pdf.addPage([W, H]); y = H - M; };
  const wrap = (text: string, font: any, size: number) => {
    const out: string[] = [];
    for (const para of clean(text).split("\n")) {
      let line = "";
      for (const w of para.split(/\s+/)) {
        const t = line ? `${line} ${w}` : w;
        if (font.widthOfTextAtSize(t, size) > maxW && line) { out.push(line); line = w; } else line = t;
      }
      out.push(line);
    }
    return out;
  };
  const write = (text: string, font: any, size: number, color = INK, gap = 4) => {
    for (const l of wrap(text, font, size)) {
      if (y < M + 30) newPage();
      page.drawText(l, { x: M, y, size, font, color: rgb(color.r, color.g, color.b) }); y -= size + gap;
    }
  };
  // Cover band
  page.drawRectangle({ x: 0, y: H - 120, width: W, height: 120, color: rgb(NAVY.r, NAVY.g, NAVY.b) });
  page.drawRectangle({ x: 0, y: H - 124, width: W, height: 4, color: rgb(TEAL.r, TEAL.g, TEAL.b) });
  page.drawText("HARMONIOUS", { x: M, y: H - 50, size: 12, font: bold, color: rgb(TEAL.r, TEAL.g, TEAL.b) });
  page.drawText(clean(KIND_LABEL[doc.kind as DocKind] ?? "Document").toUpperCase(), { x: M, y: H - 70, size: 9, font: reg, color: rgb(1, 1, 1) });
  const titleLines = wrap(doc.title, bold, 20).slice(0, 2);
  titleLines.forEach((l, i) => page.drawText(l, { x: M, y: H - 95 - i * 22, size: 20, font: bold, color: rgb(1, 1, 1) }));
  y = H - 160;
  if (doc.recipient_name) write(`Prepared for ${doc.recipient_name}`, reg, 10);
  write(new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), reg, 10);
  y -= 14;
  for (const s of sections) {
    if (y < M + 80) newPage();
    write(s.title, bold, 14, NAVY, 6);
    if (s.question) write(`Question: ${s.question}`, reg, 9, { r: 0.4, g: 0.4, b: 0.45 });
    write(s.body || " ", reg, 10.5, INK, 4);
    y -= 12;
  }
  footer(page);
  return await pdf.save();
}

export async function renderDocx(doc: any, sections: Section[], draft: boolean): Promise<Uint8Array> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Footer } = await import("docx");
  const children: any[] = [
    new Paragraph({ children: [new TextRun({ text: "HARMONIOUS", bold: true, color: "5DC6D1", size: 24, font: "Rubik" })] }),
    new Paragraph({ children: [new TextRun({ text: (KIND_LABEL[doc.kind as DocKind] ?? "Document").toUpperCase(), color: "142647", size: 18, font: "Poppins" })] }),
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: doc.title, bold: true, color: "142647", font: "Rubik", size: 44 })] }),
  ];
  if (doc.recipient_name) children.push(new Paragraph({ children: [new TextRun({ text: `Prepared for ${doc.recipient_name}`, font: "Poppins" })] }));
  if (draft) children.push(new Paragraph({ children: [new TextRun({ text: "DRAFT - not approved", bold: true, color: "5DC6D1", font: "Poppins" })] }));
  for (const s of sections) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 300 }, children: [new TextRun({ text: s.title, color: "142647", font: "Rubik", bold: true })] }));
    if (s.question) children.push(new Paragraph({ children: [new TextRun({ text: `Question: ${s.question}`, italics: true, color: "666666", font: "Poppins" })] }));
    for (const line of (s.body || "").split("\n")) {
      const bullet = line.startsWith("- ");
      children.push(new Paragraph({ bullet: bullet ? { level: 0 } : undefined, children: [new TextRun({ text: bullet ? line.slice(2) : line, color: "221F20", font: "Poppins", size: 21 })] }));
    }
  }
  const d = new Document({ sections: [{ footers: { default: new Footer({ children: [new Paragraph({ children: [new TextRun({ text: "Harmonious | harmonious.co", color: "142647", size: 16, font: "Poppins" })] })] }) }, children }] });
  const buf = await Packer.toBuffer(d);
  return new Uint8Array(buf);
}
