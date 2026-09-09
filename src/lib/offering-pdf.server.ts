import { regTypeDescription, regTypeLongLabel, requiresVerifiedAccreditation } from "@/lib/reg-types";
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

  const regLabel = regTypeLongLabel(input.regType);
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
      const runningTitle = sanitize(input.title);
      const size = 9;
      const w = regular.widthOfTextAtSize(runningTitle, size);
      page.drawText(runningTitle, {
        x: Math.max(MARGIN + 130, width - MARGIN - w),
        y: height - 36,
        size,
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
    requiresVerifiedAccreditation(input.regType)
      ? "Offered under Rule 506(c). Participation is limited to accredited investors whose status has been verified."
      : regTypeDescription(input.regType),
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

export interface OfferingPacketInput {
  offeringName: string;
  regType: "506b" | "506c" | string;
  summary?: string | null;
  minInvestmentCents?: number | null;
  targetRaiseCents?: number | null;
  isOpen?: boolean;
  wireInstructions: Record<string, string>;
  documents: Array<{ title: string; docType: string; body: string; requiresSignature: boolean }>;
  generatedAt?: string;
}

const WIRE_LABELS: Record<string, string> = {
  bank_name: "Bank name",
  bank_address: "Bank address",
  account_name: "Account name",
  account_number: "Account number",
  routing_number: "Routing number (ABA)",
  swift: "SWIFT / BIC",
  memo: "Reference / memo",
};

function money(cents?: number | null) {
  if (cents === null || cents === undefined) return null;
  return `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

/** Renders the full fund packet — cover, wire instructions and every document — as one branded PDF. */
export async function buildOfferingPacketPdf(input: OfferingPacketInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  const regLabel = regTypeLongLabel(input.regType);
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const issued = new Date(generatedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  pdf.setTitle(`${input.offeringName} — Investor document packet`);
  pdf.setAuthor("Harmonious");
  pdf.setSubject(regLabel);
  pdf.setProducer("Harmonious");
  pdf.setCreator("Harmonious");

  let page = pdf.addPage();
  let { width, height } = page.getSize();
  const maxWidth = width - MARGIN * 2;
  let y = height - MARGIN;
  let runningTitle = "Investor document packet";

  const header = (cover = false) => {
    const bandHeight = cover ? 108 : 56;
    page.drawRectangle({ x: 0, y: height - bandHeight, width, height: bandHeight, color: NAVY });
    page.drawRectangle({ x: 0, y: height - bandHeight - 3, width, height: 3, color: TEAL });
    page.drawText("HARMONIOUS", {
      x: MARGIN,
      y: height - 38,
      size: cover ? 18 : 13,
      font: bold,
      color: WHITE,
    });
    if (cover) {
      page.drawText(sanitize(input.offeringName), { x: MARGIN, y: height - 64, size: 11, font: regular, color: TEAL });
      page.drawText(regLabel, { x: MARGIN, y: height - 84, size: 10, font: regular, color: WHITE });
    } else {
      const rt = sanitize(runningTitle);
      const size = 9;
      const w = regular.widthOfTextAtSize(rt, size);
      page.drawText(rt, {
        x: Math.max(MARGIN + 130, width - MARGIN - w),
        y: height - 36,
        size,
        font: regular,
        color: TEAL,
      });
    }
    y = height - bandHeight - 34;
  };

  const newPage = (cover = false) => {
    page = pdf.addPage();
    ({ width, height } = page.getSize());
    header(cover);
  };

  const draw = (text: string, font: any, size: number, color = INK, leading = 1.5) => {
    for (const line of wrap(text, font, size, maxWidth)) {
      if (y < MARGIN + 48) newPage();
      if (line) page.drawText(line, { x: MARGIN, y, size, font, color });
      y -= size * leading;
    }
  };

  const rule = () => {
    y -= 4;
    page.drawRectangle({ x: MARGIN, y: y + 6, width: maxWidth, height: 1, color: TEAL });
    y -= 16;
  };

  // ---- Cover page ----
  header(true);
  draw("Investor document packet", bold, 22, NAVY, 1.25);
  draw(`Issued ${issued}`, italic, 9.5, MUTED);
  rule();

  if (input.summary?.trim()) {
    draw(input.summary, regular, 11, INK, 1.55);
    y -= 10;
  }

  const facts: Array<[string, string]> = [["Offering exemption", regLabel]];
  const min = money(input.minInvestmentCents);
  if (min) facts.push(["Minimum investment", min]);
  const target = money(input.targetRaiseCents);
  if (target) facts.push(["Target raise", target]);
  facts.push(["Status", input.isOpen ? "Open to new commitments" : "Closed to new commitments"]);

  for (const [label, value] of facts) {
    if (y < MARGIN + 60) newPage();
    page.drawText(sanitize(label), { x: MARGIN, y, size: 10, font: bold, color: NAVY });
    page.drawText(sanitize(value), { x: MARGIN + 170, y, size: 10, font: regular, color: INK });
    y -= 17;
  }

  y -= 12;
  if (y < MARGIN + 90) newPage();
  draw("Contents", bold, 13, NAVY, 1.35);
  draw("1. Funding instructions", regular, 10.5, INK, 1.45);
  input.documents.forEach((d, i) => {
    draw(
      `${i + 2}. ${d.title}${d.requiresSignature ? " (signature required)" : ""}`,
      regular,
      10.5,
      INK,
      1.45,
    );
  });
  if (input.documents.length === 0) {
    draw("No fund documents have been published for this fund yet.", italic, 10, MUTED, 1.45);
  }

  // ---- Funding instructions ----
  runningTitle = "Funding instructions";
  newPage();
  draw("Funding instructions", bold, 20, NAVY, 1.3);
  draw("Wire transfer details for this fund", italic, 9.5, MUTED);
  rule();

  const wireEntries = Object.entries(input.wireInstructions ?? {}).filter(
    ([, v]) => String(v ?? "").trim() !== "",
  );
  if (wireEntries.length === 0) {
    draw(
      "No wire instructions have been saved for this fund. Add them in the Harmonious admin console before sending this packet to an investor.",
      regular,
      11,
      INK,
      1.55,
    );
  } else {
    for (const [key, value] of wireEntries) {
      if (y < MARGIN + 60) newPage();
      const label = WIRE_LABELS[key] ?? key.replace(/_/g, " ");
      page.drawText(sanitize(label), { x: MARGIN, y, size: 10, font: bold, color: NAVY });
      const valueLines = wrap(String(value), regular, 10.5, maxWidth - 180);
      valueLines.forEach((line, i) => {
        if (line) page.drawText(line, { x: MARGIN + 180, y: y - i * 15, size: 10.5, font: regular, color: INK });
      });
      y -= Math.max(1, valueLines.length) * 15 + 6;
    }
  }

  y -= 14;
  if (y < MARGIN + 110) newPage();
  page.drawRectangle({ x: MARGIN, y: y - 62, width: maxWidth, height: 74, color: rgb(0.98, 0.93, 0.9) });
  const warnY = y;
  page.drawText("Fraud warning", { x: MARGIN + 14, y: warnY - 4, size: 11, font: bold, color: NAVY });
  y = warnY - 24;
  for (const line of wrap(
    "Always verify these details by telephone using a number you already have on file for Harmonious before sending funds. Harmonious will never send you changed banking details by email, and will never ask you to wire funds to a different account.",
    regular,
    9.5,
    maxWidth - 28,
  )) {
    if (line) page.drawText(line, { x: MARGIN + 14, y, size: 9.5, font: regular, color: INK });
    y -= 13;
  }
  y -= 16;

  // ---- Documents ----
  for (const doc of input.documents) {
    runningTitle = doc.title;
    newPage();
    draw(doc.title, bold, 20, NAVY, 1.3);
    draw(
      `${doc.docType.replace(/_/g, " ").toUpperCase()}  ·  ${
        doc.requiresSignature ? "Signature required" : "Review only"
      }`,
      italic,
      9.5,
      MUTED,
    );
    rule();
    draw(doc.body, regular, 11, INK, 1.55);
    y -= 18;
    if (y < MARGIN + 70) newPage();
    draw(
      doc.requiresSignature
        ? "This document requires an investor signature. Execute it electronically inside the Harmonious investor portal; a countersigned copy with an audit trail is issued on completion."
        : "This document is provided for review. No signature is required.",
      italic,
      9.5,
      MUTED,
      1.4,
    );
  }

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
