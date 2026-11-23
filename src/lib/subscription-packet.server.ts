/**
 * Server-only: builds the fund's subscription agreement packet as one branded PDF from the
 * fund's current approved, unsealed document versions (rules in subscription-packet-model.ts).
 * Read-only: never changes documents, signatures or approvals. Wire details only when passed in.
 */
import { PDFDocument, PDFName, PDFNumber, PDFString, StandardFonts, rgb, type PDFFont, type PDFPage, type PDFRef } from "pdf-lib";
import { selectPacketDocuments, sectionFor, TAX_FORMS, type PacketDocInput } from "@/lib/subscription-packet-model";
import questions from "@/lib/standard-investor-questionnaire.json";

const NAVY = rgb(0.078, 0.149, 0.278), TEAL = rgb(0.365, 0.776, 0.82), INK = rgb(0.133, 0.122, 0.125);
const SLATE = rgb(0.255, 0.357, 0.506), LINE = rgb(0.835, 0.863, 0.902), TEALBG = rgb(0.91, 0.965, 0.973), WHITE = rgb(1, 1, 1);
const W = 612, H = 792, M = 54, CW = W - 2 * M;

const clean = (t: string) => t.replace(/\r\n?/g, "\n").replace(/[\u2018\u2019\u201B]/g, "'").replace(/[\u201C\u201D]/g, '"')
  .replace(/[\u2013\u2014]/g, "-").replace(/\u2026/g, "...").replace(/[\u00A0\u2002-\u200B]/g, " ").replace(/\t/g, "    ")
  .replace(/[\u2022\u25CF\u25AA]/g, "\u00B7").replace(/[^\n\x20-\x7E\xA0-\xFF]/g, "");
function wrap(text: string, f: PDFFont, size: number, max: number) {
  const out: string[] = [];
  for (const para of clean(text).split("\n")) {
    let cur = "";
    for (const w of para.split(/ +/)) {
      const cand = cur ? `${cur} ${w}` : w;
      if (f.widthOfTextAtSize(cand, size) > max && cur) { out.push(cur); cur = w; } else cur = cand;
    }
    out.push(cur);
  }
  return out;
}
const money = (c?: number | null) => (c == null ? null : `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`);
const pct = (n?: number | null) => (n == null ? null : `${Number(n)}%`);

type Para = { text: string; heading: boolean; center: boolean; bold: boolean };
/** Reads a Word file's paragraphs (text, headings, centering, bold) without changing any wording. */
async function docxParagraphs(bytes: ArrayBuffer): Promise<Para[]> {
  const JSZip = (await import("jszip")).default;
  const xml = (await (await JSZip.loadAsync(bytes)).file("word/document.xml")?.async("string")) ?? "";
  const ent = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  const out: Para[] = [];
  for (const p of xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []) {
    const runs = p.match(/<w:r[ >][\s\S]*?<\/w:r>/g) ?? [];
    let text = "", boldChars = 0;
    for (const r of runs) {
      const t = ent((r.match(/<w:t[^>]*>[\s\S]*?<\/w:t>|<w:tab\/>|<w:br\/>/g) ?? []).map((x) => x === "<w:tab/>" ? "\t" : x === "<w:br/>" ? "\n" : x.replace(/<[^>]+>/g, "")).join(""));
      if (/<w:b\/>|<w:b w:val="(1|true)"/.test(r)) boldChars += t.length;
      text += t;
    }
    const style = p.match(/<w:pStyle w:val="([^"]+)"/)?.[1] ?? "";
    out.push({ text, heading: /heading|title/i.test(style), center: /<w:jc w:val="center"/.test(p), bold: text.trim().length > 0 && boldChars >= text.trim().length * 0.8 });
  }
  return out;
}

export type PacketBuildInput = { fundId: string; wire?: Record<string, string> | null };

export async function buildSubscriptionPacket(db: any, input: PacketBuildInput): Promise<{ bytes: Uint8Array; fileName: string; included: string[]; missing: string[] }> {
  const { data: o } = await db.from("offerings").select("id, name, legal_entity_name, min_investment_cents, offering_close_date, fund_signatory_person_id, signatory_title").eq("id", input.fundId).maybeSingle();
  if (!o) throw new Error("That fund no longer exists.");
  const [{ data: docs }, { data: fee }, { data: signer }] = await Promise.all([
    db.from("offering_documents").select("id, title, doc_type, document_category, usage, active_version, removed_at, sort_order").eq("offering_id", o.id).is("removed_at", null).order("sort_order"),
    db.from("fund_fee_terms").select("management_fee_pct, management_fee_basis, carry_pct, hurdle_pct").eq("offering_id", o.id).eq("status", "active").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    o.fund_signatory_person_id ? db.from("persons").select("legal_first_name, legal_last_name, preferred_name, email").eq("id", o.fund_signatory_person_id).maybeSingle() : { data: null },
  ]);
  const docRows = (docs ?? []) as any[];
  const { data: versions } = docRows.length
    ? await db.from("offering_document_versions").select("id, offering_document_id, version, file_name, file_path, approval_status, superseded_at").in("offering_document_id", docRows.map((d) => d.id))
    : { data: [] };
  const vByDoc = new Map(((versions ?? []) as any[]).map((v) => [`${v.offering_document_id}:${v.version}`, v]));
  const { sealedIds } = await import("@/lib/sealed-records.server");
  const sealed = await sealedIds(db, "offering_document_versions");
  const inputs: (PacketDocInput & { path: string | null })[] = docRows.map((d) => {
    const v = vByDoc.get(`${d.id}:${d.active_version}`);
    return { versionId: v?.id ?? d.id, title: d.title, docType: d.doc_type, category: d.document_category, usage: d.usage, approvalStatus: v?.approval_status ?? null, supersededAt: v?.superseded_at ?? null, fileName: v?.file_name ?? null, path: v?.file_path ?? null };
  });
  const { included, missing } = selectPacketDocuments(inputs, sealed);

  const pdf = await PDFDocument.create();
  const reg = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold), ital = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const fund = (o.legal_entity_name || o.name) as string;
  pdf.setTitle(`${fund} · Subscription packet`); pdf.setAuthor("Harmonious"); pdf.setCreator("Harmonious"); pdf.setProducer("Harmonious");
  const branded = new Set<PDFPage>();
  const marks: { title: string; page: PDFPage }[] = [];

  const newPage = () => { const p = pdf.addPage([W, H]); branded.add(p); return p; };
  const header = (p: PDFPage, running: string) => {
    p.drawText("HARMONIOUS", { x: M, y: H - 44, size: 11, font: bold, color: NAVY });
    const r = clean(`${fund} · ${running}`).slice(0, 90);
    p.drawText(r, { x: W - M - reg.widthOfTextAtSize(r, 8), y: H - 42, size: 8, font: reg, color: SLATE });
    p.drawLine({ start: { x: M, y: H - 54 }, end: { x: W - M, y: H - 54 }, thickness: 1.2, color: TEAL });
  };
  const text = (p: PDFPage, s: string, x: number, y: number, size: number, f = reg, color = INK, max = CW, lead = 1.45) => {
    for (const l of wrap(s, f, size, max)) { p.drawText(l, { x, y, size, font: f, color }); y -= size * lead; }
    return y;
  };

  // Cover
  const cover = newPage();
  cover.drawRectangle({ x: 0, y: 0, width: W, height: H, color: NAVY });
  cover.drawRectangle({ x: 0, y: H * 0.42, width: W, height: 4, color: TEAL });
  cover.drawText("HARMONIOUS", { x: M, y: H - 80, size: 16, font: bold, color: WHITE });
  cover.drawText("SUBSCRIPTION PACKET", { x: M, y: H * 0.42 + 130, size: 11, font: bold, color: TEAL });
  let cy = text(cover, fund.toUpperCase(), M, H * 0.42 + 96, 28, bold, WHITE, CW, 1.15);
  if (o.legal_entity_name && o.legal_entity_name !== o.name) text(cover, o.name, M, cy - 4, 12, reg, WHITE);
  const issued = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  text(cover, "Everything you need to subscribe: the fund documents, the Subscriber Information Form and the tax forms.", M, H * 0.42 - 40, 12, reg, WHITE, CW - 60);
  const signerName = signer ? (signer.preferred_name || `${signer.legal_first_name ?? ""} ${signer.legal_last_name ?? ""}`).trim() : "";
  if (signerName) text(cover, `Fund manager: ${signerName}${o.signatory_title ? `, ${o.signatory_title}` : ""}${signer?.email ? ` · ${signer.email}` : ""}`, M, 120, 9.5, reg, WHITE);
  text(cover, `Prepared ${issued} · Confidential`, M, 100, 9.5, reg, TEAL);
  marks.push({ title: "Cover", page: cover });

  // Fund at a glance + how to complete
  const g = newPage(); header(g, "Subscription packet"); marks.push({ title: "Fund at a glance", page: g });
  g.drawText("Fund at a glance", { x: M, y: H - 100, size: 20, font: bold, color: NAVY });
  const rows: [string, string | null][] = [
    ["Fund", fund], ["Minimum investment", money(o.min_investment_cents)],
    ["Management fee", fee ? [pct(fee.management_fee_pct), fee.management_fee_basis].filter(Boolean).join(", ") : null],
    ["Carried interest", fee ? pct(fee.carry_pct) : null], ["Hurdle", fee?.hurdle_pct ? pct(fee.hurdle_pct) : null],
    ["Final close date", o.offering_close_date ? new Date(`${o.offering_close_date}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : null],
    ["Fund manager", signerName ? `${signerName}${o.signatory_title ? `, ${o.signatory_title}` : ""}` : null],
    ["Questions", "support@harmonious.co"],
  ];
  let y = H - 130;
  for (const [k, v] of rows) {
    if (!v) continue;
    g.drawRectangle({ x: M, y: y - 8, width: CW, height: 24, color: TEALBG });
    g.drawText(k, { x: M + 10, y, size: 9.5, font: bold, color: NAVY });
    y = Math.min(text(g, v, M + 170, y, 9.5, reg, INK, CW - 180), y) - 14;
  }
  y -= 8;
  g.drawText("How to complete this packet", { x: M, y, size: 15, font: bold, color: NAVY }); y -= 24;
  const steps = [
    "Read the documents marked \"Read and keep\". Nothing to sign in them.",
    "Sign the documents marked \"Sign\" where your name appears. The divider before each document says exactly what to fill in.",
    "Complete the Subscriber Information Form. It asks the same questions as the online steps.",
    "Complete one tax form only: the one that applies to the investor.",
    "Return everything to your fund manager or support@harmonious.co. You can also complete all of this online in your Harmonious portal.",
  ];
  steps.forEach((s, i) => {
    g.drawCircle({ x: M + 9, y: y + 3, size: 9, color: NAVY });
    g.drawText(String(i + 1), { x: M + 6.5, y, size: 9, font: bold, color: WHITE });
    y = text(g, s, M + 28, y, 10, reg, INK, CW - 28) - 8;
  });
  y -= 6;
  y = text(g, input.wire && Object.keys(input.wire).length
    ? "Wire instructions are on the next page. Always confirm them by phone with a number you already have before sending money."
    : "Wire instructions are provided separately once your subscription is accepted. Harmonious never sends changed bank details by email.", M, y, 9.5, ital, SLATE) - 6;
  if (missing.length) text(g, `Not yet in this packet (still being finalized): ${missing.join(", ")}. Ask your fund manager for the current copy.`, M, y, 9.5, ital, SLATE);

  if (input.wire && Object.keys(input.wire).length) {
    const wp = newPage(); header(wp, "Wire instructions"); marks.push({ title: "Wire instructions", page: wp });
    wp.drawText("Wire instructions", { x: M, y: H - 100, size: 20, font: bold, color: NAVY });
    let wy = H - 135;
    for (const [k, v] of Object.entries(input.wire)) { if (!v) continue; wp.drawText(clean(k.replace(/_/g, " ")), { x: M, y: wy, size: 9.5, font: bold, color: NAVY }); wy = text(wp, String(v), M + 170, wy, 9.5, reg, INK, CW - 170) - 10; }
  }

  const divider = (title: string, action: string, notes: string[]) => {
    const d = newPage(); header(d, title); marks.push({ title, page: d });
    d.drawRectangle({ x: M, y: H - 230, width: CW, height: 140, color: NAVY });
    d.drawText(clean(action.toUpperCase()), { x: M + 24, y: H - 120, size: 10, font: bold, color: TEAL });
    text(d, title, M + 24, H - 152, 22, bold, WHITE, CW - 48, 1.15);
    let dy = H - 270;
    for (const n of notes) { d.drawRectangle({ x: M, y: dy - 2, width: 4, height: 12, color: TEAL }); dy = text(d, n, M + 16, dy, 11, reg, INK, CW - 16) - 10; }
  };

  for (const d of included as (PacketDocInput & { path: string | null })[]) {
    const s = sectionFor(d);
    divider(s.title, s.action, s.notes);
    const { data: blob } = d.path ? await db.storage.from("offering-files").download(d.path) : { data: null };
    if (!blob) { const p = newPage(); header(p, s.title); text(p, "This document could not be loaded. Ask your fund manager for a copy.", M, H - 100, 11, ital, SLATE); continue; }
    const buf = await blob.arrayBuffer();
    const head = new Uint8Array(buf.slice(0, 4));
    if (head[0] === 0x25 && head[1] === 0x50) {
      const src = await PDFDocument.load(buf, { ignoreEncryption: true });
      for (const p of await pdf.copyPages(src, src.getPageIndices())) pdf.addPage(p);
      continue;
    }
    // Word file: set in clean type, wording unchanged.
    let p = newPage(); header(p, s.title); let py = H - 84;
    let blank = 0;
    for (const para of await docxParagraphs(buf)) {
      // Word uses empty paragraphs for spacing; keep one small gap, never half-empty pages.
      if (!para.text.trim()) { if (blank++ === 0) py -= 6; continue; }
      blank = 0;
      const isHead = para.heading || (para.bold && para.text.length < 120);
      const size = isHead ? 11 : 9.5, f = isHead ? bold : reg, lead = size * 1.42;
      const lines = wrap(para.text.trim(), f, size, CW);
      if (isHead && py < 120) { p = newPage(); header(p, s.title); py = H - 84; }
      for (const l of lines) {
        if (py < 60) { p = newPage(); header(p, s.title); py = H - 84; }
        const x = para.center || para.heading ? M + (CW - f.widthOfTextAtSize(l, size)) / 2 : M;
        if (l) p.drawText(l, { x, y: py, size, font: f, color: isHead ? NAVY : INK });
        py -= lead;
      }
      py -= isHead ? 4 : 3;
    }
  }

  // Subscriber Information Form
  divider("Subscriber Information Form", "Complete", ["The same questions the online steps ask, so paper and screen always match.", "Answer every question that applies to the investor. Tick one box where choices are listed.", "Questions that apply only to certain investors say so."]);
  let fp = newPage(); header(fp, "Subscriber Information Form"); let fy = H - 90;
  for (const q of questions as any[]) {
    if (q.type === "document") continue;
    const opts: string[] = q.options ?? [];
    const need = 22 + (opts.length ? opts.length * 14 : 26);
    if (fy - need < 60) { fp = newPage(); header(fp, "Subscriber Information Form"); fy = H - 90; }
    fy = text(fp, q.label + (q.required ? "" : " (if applicable)"), M, fy, 9.5, bold, NAVY) - 4;
    if (opts.length) for (const op of opts) { fp.drawRectangle({ x: M + 4, y: fy - 1, width: 8, height: 8, borderColor: SLATE, borderWidth: 0.8 }); fy = text(fp, op, M + 20, fy, 9, reg, INK, CW - 20, 1.35) - 3; }
    else { fy -= 14; fp.drawLine({ start: { x: M, y: fy }, end: { x: W - M, y: fy }, thickness: 0.6, color: LINE }); fy -= 8; }
    fy -= 10;
  }

  // Tax forms
  divider("Tax forms", "Complete one form only", [...TAX_FORMS.map((t) => `${t.label}: ${t.who}`), "Sign and date the one that applies. If you are unsure which form you need, ask your tax adviser."]);
  for (const t of TAX_FORMS) {
    const { data: blob } = await db.storage.from("offering-files").download(`packet-assets/irs/${t.key}.pdf`);
    if (!blob) continue;
    const src = await PDFDocument.load(await blob.arrayBuffer(), { ignoreEncryption: true });
    const pages = await pdf.copyPages(src, src.getPageIndices());
    pages.forEach((p, i) => { pdf.addPage(p); if (i === 0) marks.push({ title: t.label, page: p }); });
  }

  // Footer page numbers on every page after the cover.
  const all = pdf.getPages(), total = all.length;
  all.forEach((p, i) => {
    if (i === 0) return;
    const { width } = p.getSize(); const label = `Packet page ${i + 1} of ${total}`;
    if (branded.has(p)) p.drawText(clean(`Harmonious · ${fund} subscription packet · Confidential`).slice(0, 120), { x: M, y: 30, size: 7.5, font: reg, color: SLATE });
    p.drawText(label, { x: width - M - reg.widthOfTextAtSize(label, 7.5), y: branded.has(p) ? 30 : 12, size: 7.5, font: reg, color: SLATE });
  });
  addOutline(pdf, marks);

  const slug = fund.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return { bytes: await pdf.save(), fileName: `${slug}-Subscription-Packet.pdf`, included: included.map((d) => d.title), missing };
}

/** Clickable bookmarks (PDF outline) for each section. */
function addOutline(pdf: PDFDocument, marks: { title: string; page: PDFPage }[]) {
  if (!marks.length) return;
  const ctx = pdf.context, root = ctx.nextRef();
  const refs: PDFRef[] = marks.map(() => ctx.nextRef());
  marks.forEach((m, i) => {
    const item = ctx.obj({ Title: PDFString.of(clean(m.title)), Parent: root, Dest: ctx.obj([m.page.ref, PDFName.of("XYZ"), null, null, null]) }) as any;
    if (i > 0) item.set(PDFName.of("Prev"), refs[i - 1]!);
    if (i < marks.length - 1) item.set(PDFName.of("Next"), refs[i + 1]!);
    ctx.assign(refs[i]!, item);
  });
  ctx.assign(root, ctx.obj({ Type: "Outlines", First: refs[0]!, Last: refs[refs.length - 1]!, Count: PDFNumber.of(marks.length) }));
  pdf.catalog.set(PDFName.of("Outlines"), root);
  pdf.catalog.set(PDFName.of("PageMode"), PDFName.of("UseOutlines"));
}
