/** Proposal PDF in the Harmonious "Proposal for Services" layout. Server-only. */
import type { Section } from "@/lib/sales-documents-model";

const NAVY = [0x0d / 255, 0x19 / 255, 0x2d / 255] as const;
const TEAL = [0x00 / 255, 0xc2 / 255, 0xd1 / 255] as const;
const INK = [0x14 / 255, 0x26 / 255, 0x47 / 255] as const;
const MUTED = [0.36, 0.42, 0.52] as const;
const RULE = [0.86, 0.89, 0.93] as const;

const clean = (s: string) => String(s ?? "").replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, (c) => ({ "\u2018": "'", "\u2019": "'", "\u201C": '"', "\u201D": '"', "\u2013": "-", "\u2014": "-", "\u2022": "-", "\u2026": "..." } as Record<string, string>)[c] ?? "");
const usd = (c: number) => `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: c % 100 ? 2 : 0, minimumFractionDigits: c % 100 ? 2 : 0 })}`;

/** Internal reviewer notes ("[confirm: ...]") and quote bullets already shown in the fee table never reach the client copy. */
export function clientSections(sections: Section[], hasLines: boolean): Section[] {
  return sections.map((s) => ({
    ...s,
    body: String(s.body ?? "")
      .split("\n")
      .filter((l) => !/^\s*\[confirm:[^\]]*\]\s*$/i.test(l))
      .filter((l) => !(hasLines && (/^\s*-\s.*=\s*\$[\d,.]+\s*$/.test(l) || /^\s*Total:\s*\$/.test(l) || /^\s*\(Pricing from the approved quote\.\)\s*$/i.test(l))))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  }));
}

export async function renderProposalPdf(doc: any, rawSections: Section[], lines: any[], draft: boolean): Promise<Uint8Array> {
  const { proposalVisibleSections, selectedServiceLabels } = await import("@/lib/sales-documents-model");
  const sections = proposalVisibleSections(clientSections(rawSections, lines.length > 0));
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const c = (k: readonly number[]) => rgb(k[0]!, k[1]!, k[2]!);
  const W = 612, H = 792, M = 54, IN = 72, maxW = W - IN * 2;
  let page = pdf.addPage([W, H]); let y = H;
  const wrap = (text: string, font: any, size: number, width = maxW) => {
    const out: string[] = [];
    for (const para of clean(text).split("\n")) {
      let line = "";
      for (const w of para.split(/\s+/)) { const t = line ? `${line} ${w}` : w; if (font.widthOfTextAtSize(t, size) > width && line) { out.push(line); line = w; } else line = t; }
      out.push(line);
    }
    return out;
  };
  const spaced = (t: string) => t.toUpperCase().split("").join(" ");
  const ensure = (need: number) => { if (y - need < M + 20) { page = pdf.addPage([W, H]); y = H - M - 20; } };
  const text = (t: string, font: any, size: number, color: readonly number[], gap = 6, x = IN) => { for (const l of wrap(t, font, size)) { ensure(size + gap); page.drawText(l, { x, y, size, font, color: c(color) }); y -= size + gap; } };
  const eyebrow = (t: string) => { ensure(60); page.drawText(spaced(t), { x: IN, y, size: 8, font: sans, color: c(TEAL) }); y -= 34; };
  const heading = (t: string) => { text(t, serif, 30, NAVY, 8); page.drawRectangle({ x: IN, y: y + 2, width: 40, height: 3, color: c(TEAL) }); y -= 34; };

  // Cover
  const coverH = 300;
  page.drawRectangle({ x: M - 24, y: H - M - coverH, width: W - (M - 24) * 2, height: coverH, color: c(NAVY) });
  page.drawText("HARMONIOUS", { x: IN, y: H - M - 60, size: 16, font: bold, color: rgb(1, 1, 1) });
  page.drawRectangle({ x: IN - 14, y: H - M - 62, width: 8, height: 16, color: c(TEAL) });
  page.drawText(spaced("Proposal for services"), { x: IN, y: H - M - 110, size: 8, font: sans, color: c(TEAL) });
  let ty = H - M - 150;
  for (const l of wrap(doc.title, serif, 34, maxW).slice(0, 3)) { page.drawText(l, { x: IN, y: ty, size: 34, font: serif, color: rgb(1, 1, 1) }); ty -= 38; }
  const summary = sections.find((s) => /summary|overview|intro/i.test(`${s.key} ${s.title}`));
  if (summary?.body) for (const l of wrap(summary.body, sans, 10.5).slice(0, 4)) { ty -= 2; page.drawText(l, { x: IN, y: ty, size: 10.5, font: sans, color: rgb(0.85, 0.88, 0.92) }); ty -= 15; }
  const note = sections.find((s) => s.key === "summary_note");
  if (note?.body) for (const l of wrap(note.body, sans, 10).slice(0, 3)) { ty -= 2; page.drawText(l, { x: IN, y: ty, size: 10, font: sans, color: c(TEAL) }); ty -= 14; }
  y = H - M - coverH - 50;
  if (doc.recipient_name) text(`Prepared for ${doc.recipient_name}`, sans, 10, MUTED, 4);
  text(new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), sans, 10, MUTED, 4);
  y -= 30;

  // Scope of services
  // "What we handle" lists only the services selected on the quote; without a quote, the written scope sections.
  const services = selectedServiceLabels(lines);
  const body = services.length
    ? services.map((label) => ({ key: "service", title: label, body: "", question: undefined } as unknown as Section))
    : sections.filter((s) => s !== summary && s.key !== "summary_note" && s.key !== "about" && !/^(pricing|fees?|investment)\b/i.test(s.title) && !/^(pricing|fees|investment)$/i.test(s.key));
  if (body.length) {
    eyebrow("Scope of services"); heading("What we handle");
    body.forEach((s, i) => {
      ensure(services.length ? 70 : 140);
      page.drawLine({ start: { x: IN, y: y + 10 }, end: { x: W - IN, y: y + 10 }, thickness: 0.6, color: c(RULE) });
      y -= 30;
      page.drawCircle({ x: IN + 18, y: y - 4, size: 18, color: c(NAVY) });
      const n = String(i + 1).padStart(2, "0");
      page.drawText(n, { x: IN + 18 - serif.widthOfTextAtSize(n, 11) / 2, y: y - 8, size: 11, font: serif, color: c(TEAL) });
      y -= 44;
      text(s.title, serif, 18, NAVY, 8);
      if (s.question) text(`Question: ${s.question}`, sans, 9, MUTED, 4);
      if (s.body) text(s.body, sans, 10.5, MUTED, 5);
      y -= services.length ? 4 : 18;
    });
  }

  // Investment
  if (lines.length) {
    ensure(200); y -= 10;
    eyebrow("Investment"); heading("Engagement fee");
    const cols = [IN, IN + 250];
    page.drawRectangle({ x: IN, y: y - 6, width: maxW, height: 22, color: c(NAVY) });
    ["SERVICE", "YOU'RE BILLED"].forEach((h, i) => page.drawText(h, { x: cols[i]! + 8, y, size: 8, font: bold, color: rgb(1, 1, 1) }));
    y -= 28;
    const BW: Record<string, string> = { monthly: "each billing period", quarterly: "quarterly", annual: "annually" };
    const EVERY: Record<string, string> = { quarterly: "every 3 months", annual: "once a year" };
    let oneTime = 0; let other = 0; const billed: Record<string, number> = {};
    for (const l of lines) {
      ensure(26);
      const amt = Number(l.line_cents ?? l.quantity * l.unit_cents) || 0;
      const f = BW[l.billing_frequency] ? l.billing_frequency : "one_time";
      const label = String(l.label ?? "").replace(/\s*\((annual|quarterly|monthly|one[- ]time)\)\s*$/i, "");
      page.drawText(wrap(label, sans, 10, 230)[0] ?? "", { x: cols[0]! + 8, y, size: 10, font: sans, color: c(INK) });
      if (f === "one_time") { oneTime += amt; page.drawText(`${usd(amt)} once, at signing`, { x: cols[1]! + 8, y, size: 9, font: sans, color: c(MUTED) }); }
      else if (f === "monthly") { other += amt; page.drawText(`${usd(amt)} ${BW["monthly"]}`, { x: cols[1]! + 8, y, size: 9, font: sans, color: c(MUTED) }); }
      else { billed[f] = (billed[f] ?? 0) + amt; page.drawText(`${usd(amt)} ${BW[f]}`, { x: cols[1]! + 8, y, size: 9, font: sans, color: c(MUTED) }); }
      page.drawLine({ start: { x: IN, y: y - 8 }, end: { x: W - IN, y: y - 8 }, thickness: 0.5, color: c(RULE) });
      y -= 24;
    }
    y -= 6;
    for (const f of ["quarterly", "annual"]) if (billed[f]) { text(`Billed ${BW[f]}: ${usd(billed[f]!)} ${EVERY[f]}`, sans, 10, INK, 6, cols[0]! + 8); }
    if (other) text(`Billed ${BW["monthly"]}: ${usd(other)}`, sans, 10, INK, 6, cols[0]! + 8);
    if (oneTime) text(`One-time fees: ${usd(oneTime)}, billed once when you sign`, sans, 10, INK, 6, cols[0]! + 8);
    y -= 6;
    text("How to get started: sign and approve this proposal. When you sign, you'll also accept our Master Services Agreement (only the first time, or when it's updated), and your invoice follows. You can pay each invoice online by card.", sans, 10, MUTED, 6, cols[0]! + 8);
    y -= 30;
  }

  // Ready to begin
  page = pdf.addPage([W, H]); y = H - M - 40;
  heading("Ready to begin?");
  text("Upon acceptance, Harmonious will schedule a kickoff to map your investor base and onboarding flow.", sans, 11, MUTED, 6);
  y -= 60;
  for (const who of [`Accepted on behalf of ${doc.recipient_name ? clean(doc.recipient_name) : "the fund"}`, "Harmonious"]) {
    page.drawLine({ start: { x: IN, y }, end: { x: IN + 300, y }, thickness: 0.8, color: c(NAVY) });
    page.drawLine({ start: { x: IN + 340, y }, end: { x: W - IN, y }, thickness: 0.8, color: c(NAVY) });
    page.drawText(spaced(who).slice(0, 90), { x: IN, y: y - 14, size: 7, font: sans, color: c(MUTED) });
    page.drawText(spaced("Date"), { x: IN + 340, y: y - 14, size: 7, font: sans, color: c(MUTED) });
    y -= 80;
  }
  for (const p of pdf.getPages()) {
    p.drawText("HARMONIOUS  |  harmonious.co", { x: IN, y: 24, size: 7, font: sans, color: c(MUTED) });
    if (draft) p.drawText("DRAFT, not approved", { x: W - IN - 90, y: 24, size: 7, font: bold, color: c(TEAL) });
  }
  return await pdf.save();
}
