import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { HELPER_INSTRUCTIONS } from "./helper-instructions-content";

const NAVY = rgb(0.078, 0.149, 0.278), TEAL = rgb(0.365, 0.776, 0.82), INK = rgb(0.133, 0.122, 0.125);
const MUTED = rgb(0.255, 0.357, 0.506);
const W = 612, H = 792, M = 54, CW = W - 2 * M;

function lines(text: string, font: PDFFont, size: number, width: number) {
  const result: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(next, size) > width) { result.push(line); line = word; }
    else line = next;
  }
  if (line) result.push(line);
  return result;
}

/** Same single page in the subscription packet and standalone client handout. */
export async function addHelperInstructionPage(pdf: PDFDocument) {
  const reg = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([W, H]);
  page.drawText("HARMONIOUS", { x: M, y: H - 44, size: 11, font: bold, color: NAVY });
  page.drawText("CLIENT INSTRUCTIONS", { x: W - M - bold.widthOfTextAtSize("CLIENT INSTRUCTIONS", 8), y: H - 42, size: 8, font: bold, color: MUTED });
  page.drawLine({ start: { x: M, y: H - 54 }, end: { x: W - M, y: H - 54 }, thickness: 1.2, color: TEAL });
  let y = H - 94;
  const draw = (value: string, size: number, font = reg, color = INK, gap = 7) => {
    for (const line of lines(value, font, size, CW)) {
      if (y < 55) throw new Error("Helper instruction sheet exceeds one page.");
      page.drawText(line, { x: M, y, size, font, color });
      y -= size * 1.32;
    }
    y -= gap;
  };
  draw(HELPER_INSTRUCTIONS.title, 22, bold, NAVY, 10);
  draw(HELPER_INSTRUCTIONS.intro, 10.5, reg, INK, 14);
  for (const section of [...HELPER_INSTRUCTIONS.steps, ...HELPER_INSTRUCTIONS.boundaries]) {
    draw(section.title, 11, bold, NAVY, 4);
    draw(section.text, 10, reg, INK, 9);
  }
  draw(HELPER_INSTRUCTIONS.help, 9, reg, MUTED, 0);
  return page;
}

export async function buildHelperInstructionSheet() {
  const pdf = await PDFDocument.create();
  pdf.setTitle("Add a paperwork helper | Harmonious");
  pdf.setAuthor("Harmonious"); pdf.setCreator("Harmonious"); pdf.setProducer("Harmonious");
  const page = await addHelperInstructionPage(pdf);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText("Harmonious · Client instructions · Guidance only, not an access grant", { x: M, y: 30, size: 8, font, color: MUTED });
  return pdf.save();
}