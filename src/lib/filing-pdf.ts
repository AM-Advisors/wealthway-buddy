import type { FilingForm } from "./filing-forms";

/** Renders a filled filing form as a PDF (pure JS). */
export async function renderFilingPdf(form: FilingForm): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 612, H = 792, M = 50, maxW = W - M * 2;
  let page = doc.addPage([W, H]);
  let y = H - M;
  const clean = (s: string) => s.replace(/[^\x20-\x7E]/g, "-");
  const wrap = (text: string, f: typeof font, size: number, width: number) => {
    const out: string[] = []; let line = "";
    for (const w of clean(text).split(" ")) {
      const t = line ? `${line} ${w}` : w;
      if (f.widthOfTextAtSize(t, size) > width && line) { out.push(line); line = w; } else line = t;
    }
    if (line) out.push(line);
    return out.length ? out : [""];
  };
  const need = (h: number) => { if (y - h < M) { page = doc.addPage([W, H]); y = H - M; } };
  const text = (s: string, f: typeof font, size: number, x = M, width = maxW, color = rgb(0.13, 0.12, 0.13)) => {
    for (const l of wrap(s, f, size, width)) { need(size + 4); page.drawText(l, { x, y: y - size, size, font: f, color }); y -= size + 4; }
  };
  text(form.title, bold, 15);
  text(form.subtitle, font, 11);
  y -= 4; text(form.where, font, 9);
  for (const n of form.notices) text(n, font, 9, M, maxW, rgb(0.6, 0.1, 0.1));
  for (const s of form.sections) {
    y -= 8; need(30);
    page.drawRectangle({ x: M, y: y - 16, width: maxW, height: 16, color: rgb(0.08, 0.15, 0.28) });
    page.drawText(clean(s.title), { x: M + 4, y: y - 12, size: 10, font: bold, color: rgb(1, 1, 1) });
    y -= 20;
    for (const fld of s.fields) {
      const labelLines = wrap(fld.label, font, 9, 250);
      const valueLines = fld.needsEntry ? ["NEEDS ENTRY"] : wrap(fld.value || "-", bold, 9, maxW - 262);
      const h = Math.max(labelLines.length, valueLines.length) * 12 + 4;
      need(h);
      labelLines.forEach((l, i) => page.drawText(l, { x: M, y: y - 10 - i * 12, size: 9, font, color: rgb(0.35, 0.35, 0.35) }));
      valueLines.forEach((l, i) => page.drawText(l, { x: M + 262, y: y - 10 - i * 12, size: 9, font: bold, color: fld.needsEntry ? rgb(0.75, 0.1, 0.1) : rgb(0.13, 0.12, 0.13) }));
      y -= h;
      page.drawLine({ start: { x: M, y: y + 1 }, end: { x: W - M, y: y + 1 }, thickness: 0.3, color: rgb(0.85, 0.85, 0.85) });
    }
  }
  const pages = doc.getPages();
  pages.forEach((p, i) => p.drawText(`Harmonious - prepared for manual filing - page ${i + 1} of ${pages.length}`, { x: M, y: 24, size: 7, font, color: rgb(0.5, 0.5, 0.5) }));
  const bytes = await doc.save();
  return bytes;
}
