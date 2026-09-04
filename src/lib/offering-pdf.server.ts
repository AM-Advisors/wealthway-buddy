import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const MARGIN = 56;
const NAVY = rgb(0.078, 0.149, 0.278); // #142647
const TEAL = rgb(0.396, 0.78, 0.82); // #65C7D1
const INK = rgb(0.133, 0.122, 0.125); // #221F20
const MUTED = rgb(0.42, 0.44, 0.5);
const WHITE = rgb(1, 1, 1);

/** StandardFonts only encode WinAnsi; normalise anything outside it so rendering never throws. */
function sanitize(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/\t/g, "  ")
    .replace(/[^\n\x20-\x7E\xA0-\xFF]/g, "");
}

function wrap(text: string, font: any, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of sanitize(text).split("\n")) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of paragraph.replace(/\s+/g, " ").trim().split(" ")) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth) {
        if (current) lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

export interface OfferingPdfInput {
  offeringName: string;
  regType: "506b" | "506c" | string;
  title: string;
  docType: string;
  body: string;
  requiresSignature: boolean;
  generatedAt?: string;
}

/** Renders a fund offering document as a branded, paginated Harmonious PDF. */
export async function buildOfferingPdf(input: OfferingPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  const regLabel = input.regType === "506c" ? "Regulation D, Rule 506(c)" : "Regulation D, Rule 506(b)";
  const generatedAt = input.generatedAt ?? new Date().toISOString();

  pdf.setTitle(`${input.offeringName} — ${input.title}`);
  pdf.setAuthor("Harmonious");
  pdf.setSubject(regLabel);
  pdf.setProducer("Harmonious");
  pdf.setCreator("Harmonious");

  let page = pdf.addPage();
  let { width, height } = page.getSize();
  const maxWidth = width - MARGIN * 2;
  let y = height - MARGIN;
  let firstPage = true;

  const header = () => {
    const bandHeight = firstPage ? 108 : 56;
    page.drawRectangle({ x: 0, y: height - bandHeight, width, height: bandHeight, color: NAVY });
    page.drawRectangle({ x: 0, y: height - bandHeight - 3, width, height: 3, color: TEAL });
    page.drawText("HARMONIOUS", {
      x: MARGIN,
      y: height - 38,
      size: firstPage ? 18 : 13,
      font: bold,
      color: WHITE,
    });
    if (firstPage) {
      page.drawText(sanitize(input.offeringName), { x: MARGIN, y: height - 64, size: 11, font: regular, color: TEAL });
      page.drawText(regLabel, { x: MARGIN, y: height - 84, size: 10, font: regular, color: WHITE });
    } else {
      page.drawText(sanitize(input.title), {
        x: MARGIN,
        y: height - 38,
        size: 9,
        font: regular,
        color: TEAL,
      });
    }
    y = height - bandHeight - 34;
  };

  const newPage = () => {
    page = pdf.addPage();
    ({ width, height } = page.getSize());
    header();
  };

  header();
  firstPage = false;

  const draw = (text: string, font: any, size: number, color = INK, leading = 1.5) => {
    for (const line of wrap(text, font, size, maxWidth)) {
      if (y < MARGIN + 48) newPage();
      if (line) page.drawText(line, { x: MARGIN, y, size, font, color });
      y -= size * leading;
    }
  };

  draw(input.title, bold, 20, NAVY, 1.3);
  y -= 4;
  draw(
    `${input.docType.replace(/_/g, " ").toUpperCase()}  ·  Issued ${new Date(generatedAt).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    })}`,
    italic,
    9.5,
    MUTED,
  );
  y -= 10;
  page.drawRectangle({ x: MARGIN, y: y + 6, width: maxWidth, height: 1, color: TEAL });
  y -= 18;

  draw(input.body, regular, 11, INK, 1.55);

  y -= 22;
  if (y < MARGIN + 90) newPage();
  draw(
    input.requiresSignature
      ? "This document requires an investor signature. Execute it electronically inside the Harmonious investor portal; a countersigned copy with an audit trail is issued on completion."
      : "This document is provided for review. No signature is required.",
    italic,
    9.5,
    MUTED,
    1.4,
  );
  y -= 6;
  draw(
    input.regType === "506c"
      ? "Offered under Rule 506(c). Participation is limited to accredited investors whose status has been verified."
      : "Offered under Rule 506(b). Offered only to investors with a pre-existing substantive relationship; no general solicitation.",
    italic,
    9.5,
    MUTED,
    1.4,
  );

  const pages = pdf.getPages();
  pages.forEach((p, index) => {
    const size = p.getSize();
    p.drawText("Confidential — Harmonious. Not an offer to sell securities.", {
      x: MARGIN,
      y: 30,
      size: 8,
      font: regular,
      color: MUTED,
    });
    const label = `Page ${index + 1} of ${pages.length}`;
    p.drawText(label, {
      x: size.width - MARGIN - regular.widthOfTextAtSize(label, 8),
      y: 30,
      size: 8,
      font: regular,
      color: MUTED,
    });
  });

  return pdf.save();
}
