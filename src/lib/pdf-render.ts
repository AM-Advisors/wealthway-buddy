/** Shared, browser-side PDF renderer for the documents clients and investors
 *  download from the portal (invoices, share certificates, capital account
 *  statements). Produces real PDF files with pdf-lib so nothing depends on the
 *  browser's print dialog. */

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { COMPANY, companyAddressLines, companyLogoUrl } from "@/lib/company-details";

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN = 52;
const NAVY = rgb(0.078, 0.149, 0.278);
const TEAL = rgb(0.365, 0.776, 0.82);
const INK = rgb(0.133, 0.122, 0.125);
const MUTED = rgb(0.42, 0.44, 0.5);
const LINE = rgb(0.9, 0.92, 0.94);

export type PdfRow = { label: string; value: string };
export type PdfSection = { heading?: string; rows?: PdfRow[]; text?: string };

export interface PdfDocSpec {
  /** Small label above the title, e.g. "Invoice". */
  kicker?: string;
  title: string;
  subtitle?: string;
  /** Right-hand badge text, e.g. "Paid". */
  badge?: string;
  meta?: PdfRow[];
  sections: PdfSection[];
  /** Small print at the end of the document. */
  notes?: string[];
  fileName: string;
}

function sanitize(text: string): string {
  return String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2022/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/\t/g, "  ")
    .replace(/[^\n\x20-\x7E\xA0-\xFF]/g, "");
}

function wrap(text: string, font: any, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of sanitize(text).split("\n")) {
    if (!paragraph.trim()) {
      out.push("");
      continue;
    }
    let current = "";
    for (const word of paragraph.replace(/\s+/g, " ").trim().split(" ")) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth) {
        if (current) out.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) out.push(current);
  }
  return out;
}

async function loadLogo(pdf: PDFDocument) {
  try {
    const res = await fetch(companyLogoUrl());
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    return await pdf.embedPng(bytes);
  } catch {
    return null;
  }
}

/** Renders a document spec as PDF bytes. */
export async function renderPdf(spec: PdfDocSpec): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await loadLogo(pdf);

  pdf.setTitle(`${spec.title}${spec.subtitle ? ` — ${spec.subtitle}` : ""}`);
  pdf.setAuthor(COMPANY.legalName);
  pdf.setProducer(COMPANY.name);
  pdf.setCreator(COMPANY.name);

  const contentWidth = PAGE_W - MARGIN * 2;
  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const newPage = () => {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  };
  const need = (space: number) => {
    if (y - space < MARGIN + 40) newPage();
  };
  const text = (
    value: string,
    opts: { size?: number; font?: any; color?: any; x?: number; align?: "left" | "right" } = {},
  ) => {
    const size = opts.size ?? 10;
    const font = opts.font ?? regular;
    const clean = sanitize(value);
    const x =
      opts.align === "right"
        ? PAGE_W - MARGIN - font.widthOfTextAtSize(clean, size)
        : (opts.x ?? MARGIN);
    page.drawText(clean, { x, y, size, font, color: opts.color ?? INK });
  };

  // Header: logo + company details
  const headerTop = y;
  if (logo) {
    const w = 130;
    const h = (logo.height / logo.width) * w;
    page.drawImage(logo, { x: MARGIN, y: headerTop - h, width: w, height: h });
    y = headerTop - h - 6;
  } else {
    y = headerTop - 14;
    text(COMPANY.name, { size: 16, font: bold, color: NAVY });
    y -= 8;
  }

  let ry = headerTop - 10;
  const rightLines = [
    COMPANY.legalName,
    ...companyAddressLines(),
    COMPANY.phone,
    COMPANY.billingEmail || COMPANY.email,
    COMPANY.website,
  ].filter(Boolean) as string[];
  for (const line of rightLines) {
    const clean = sanitize(line);
    page.drawText(clean, {
      x: PAGE_W - MARGIN - regular.widthOfTextAtSize(clean, 8.5),
      y: ry,
      size: 8.5,
      font: regular,
      color: MUTED,
    });
    ry -= 12;
  }

  y = Math.min(y, ry) - 14;
  page.drawRectangle({ x: MARGIN, y, width: contentWidth, height: 2, color: NAVY });
  y -= 30;

  // Title block
  if (spec.kicker) {
    text(spec.kicker.toUpperCase(), { size: 8.5, font: bold, color: TEAL });
    y -= 14;
  }
  text(spec.title, { size: 19, font: bold, color: NAVY });
  if (spec.badge) {
    text(spec.badge, { size: 10, font: bold, color: NAVY, align: "right" });
  }
  y -= 18;
  if (spec.subtitle) {
    for (const line of wrap(spec.subtitle, regular, 10.5, contentWidth)) {
      text(line, { size: 10.5, color: MUTED });
      y -= 14;
    }
  }
  y -= 10;

  // Meta grid
  if (spec.meta?.length) {
    const cols = 2;
    const colW = contentWidth / cols;
    let col = 0;
    let rowTop = y;
    for (const m of spec.meta) {
      need(34);
      if (col === 0) rowTop = y;
      const x = MARGIN + col * colW;
      page.drawText(sanitize(m.label.toUpperCase()), {
        x,
        y: rowTop,
        size: 7.5,
        font: bold,
        color: MUTED,
      });
      page.drawText(sanitize(m.value), {
        x,
        y: rowTop - 13,
        size: 10,
        font: regular,
        color: INK,
      });
      col += 1;
      if (col === cols) {
        col = 0;
        y = rowTop - 32;
      }
    }
    if (col !== 0) y = rowTop - 32;
    y -= 4;
  }

  // Sections
  for (const section of spec.sections) {
    need(60);
    if (section.heading) {
      text(section.heading.toUpperCase(), { size: 8.5, font: bold, color: TEAL });
      y -= 16;
    }
    if (section.text) {
      for (const line of wrap(section.text, regular, 10, contentWidth)) {
        need(16);
        text(line, { size: 10, color: INK });
        y -= 14;
      }
      y -= 6;
    }
    for (const row of section.rows ?? []) {
      need(24);
      text(row.label, { size: 10, color: MUTED });
      text(row.value, { size: 10, font: bold, align: "right" });
      y -= 8;
      page.drawRectangle({ x: MARGIN, y, width: contentWidth, height: 0.6, color: LINE });
      y -= 14;
    }
    y -= 12;
  }

  // Notes
  if (spec.notes?.length) {
    need(40);
    y -= 4;
    page.drawRectangle({ x: MARGIN, y, width: contentWidth, height: 0.6, color: LINE });
    y -= 16;
    for (const note of spec.notes) {
      for (const line of wrap(note, regular, 8.5, contentWidth)) {
        need(14);
        text(line, { size: 8.5, color: MUTED });
        y -= 11;
      }
      y -= 6;
    }
  }

  // Footer on every page
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    const label = `${COMPANY.legalName} · ${COMPANY.website} · page ${i + 1} of ${pages.length}`;
    p.drawText(sanitize(label), {
      x: MARGIN,
      y: MARGIN - 18,
      size: 7.5,
      font: regular,
      color: MUTED,
    });
  });

  return await pdf.save();
}

function toBlob(bytes: Uint8Array) {
  return new Blob([bytes.slice() as unknown as BlobPart], { type: "application/pdf" });
}

/** Saves the rendered document to the visitor's device as a PDF. */
export async function downloadPdfDoc(spec: PdfDocSpec) {
  const url = URL.createObjectURL(toBlob(await renderPdf(spec)));
  const link = document.createElement("a");
  link.href = url;
  link.download = spec.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Opens the rendered document in a new tab using the browser's PDF viewer. */
export async function openPdfDoc(spec: PdfDocSpec): Promise<boolean> {
  const url = URL.createObjectURL(toBlob(await renderPdf(spec)));
  const win = window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return Boolean(win);
}
