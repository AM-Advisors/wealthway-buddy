import { mkdir, writeFile } from "node:fs/promises";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { INVESTOR_DOCUMENT_GUIDE } from "../../src/lib/investor-document-guide-content";

const NAVY = rgb(0.078, 0.149, 0.278), TEAL = rgb(0.365, 0.776, 0.82), INK = rgb(0.133, 0.122, 0.125), MUTED = rgb(0.255, 0.357, 0.506);
const W = 612, H = 792, M = 54, CW = W - M * 2;
const pdf = await PDFDocument.create();
pdf.setTitle("Email documents to investors | Harmonious");
pdf.setAuthor("Harmonious"); pdf.setCreator("Harmonious"); pdf.setProducer("Harmonious");
const reg = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
const page = pdf.addPage([W, H]);
page.drawText("HARMONIOUS", { x: M, y: H - 44, size: 11, font: bold, color: NAVY });
const label = "FUND MANAGER INSTRUCTIONS";
page.drawText(label, { x: W - M - bold.widthOfTextAtSize(label, 8), y: H - 42, size: 8, font: bold, color: MUTED });
page.drawLine({ start: { x: M, y: H - 54 }, end: { x: W - M, y: H - 54 }, thickness: 1.2, color: TEAL });
let y = H - 94;
function wrap(value: string, font: PDFFont, size: number) {
  const rows: string[] = []; let row = "";
  for (const word of value.split(/\s+/)) {
    const next = row ? `${row} ${word}` : word;
    if (row && font.widthOfTextAtSize(next, size) > CW) { rows.push(row); row = word; } else row = next;
  }
  if (row) rows.push(row);
  return rows;
}
function draw(value: string, size: number, font = reg, color = INK, gap = 8) {
  for (const row of wrap(value, font, size)) {
    if (y < 55) throw new Error("Investor document instruction sheet exceeds one page.");
    page.drawText(row, { x: M, y, size, font, color }); y -= size * 1.3;
  }
  y -= gap;
}
draw(INVESTOR_DOCUMENT_GUIDE.title, 22, bold, NAVY, 11);
draw(INVESTOR_DOCUMENT_GUIDE.intro, 10.5, reg, INK, 14);
for (const section of INVESTOR_DOCUMENT_GUIDE.sections) {
  draw(section.title, 11, bold, NAVY, 4);
  draw(section.text, 10, reg, INK, 9);
}
page.drawText("Harmonious · Fund manager instructions · Guidance only; no documents sent", { x: M, y: 30, size: 8, font: reg, color: MUTED });
await mkdir("public/downloads", { recursive: true });
await writeFile("public/downloads/Harmonious-Send-Investor-Documents-Guide.pdf", await pdf.save());
console.log(`Created one-page guide; lowest body baseline ${Math.round(y)} points.`);