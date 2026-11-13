const fs = require("fs");
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun, Header, Footer, AlignmentType, LevelFormat, HeadingLevel, BorderStyle, WidthType, ShadingType, VerticalAlign, PageNumber, TabStopType, HeightRule, PageBreak } = require("docx");
const D = JSON.parse(fs.readFileSync("content.json", "utf8"));
const NAVY = "142647", TEAL = "5DC6D1", INK = "221F20", SLATE = "415B81", LINE = "D5DCE6", FILL = "F6F8FB", TEALBG = "E8F6F8";
const CW = 9360, NUMW = 900, QW = CW - NUMW;
const b = (c = LINE) => ({ style: BorderStyle.SINGLE, size: 4, color: c });
const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const borders = { top: b(), bottom: b(), left: b(), right: b() };
const noB = { top: none, bottom: none, left: none, right: none };
const mg = { top: 80, bottom: 80, left: 120, right: 120 };
const p = (text, o = {}) => new Paragraph({ spacing: { after: o.after ?? 120 }, children: [new TextRun({ text, size: o.size ?? 20, color: o.color ?? INK, bold: o.bold, italics: o.italics })] });
const logo = fs.readFileSync("logo-navy.png");
const total = D.sections.reduce((n, s) => n + s.questions.length, 0);

const cover = [
  new Paragraph({ spacing: { after: 480 }, children: [new ImageRun({ type: "png", data: logo, transformation: { width: 190, height: Math.round(190 * 449 / 1917) }, altText: { title: "Harmonious", description: "Harmonious logo", name: "logo" } })] }),
  new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "DUE DILIGENCE", size: 20, bold: true, color: TEAL })] }),
  new Paragraph({ heading: HeadingLevel.TITLE, spacing: { after: 120 }, children: [new TextRun({ text: D.title, size: 52, bold: true, color: NAVY })] }),
  new Paragraph({ spacing: { after: 360 }, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: TEAL, space: 8 } }, children: [new TextRun({ text: `${D.sections.length} sections · ${total} questions · for companies at every stage, from pre-seed to growth.`, size: 22, color: SLATE })] }),
  new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("How to complete this questionnaire")] }),
  ...D.instructions.map((t) => new Paragraph({ numbering: { reference: "bullets", level: 0 }, spacing: { after: 80 }, children: [new TextRun({ text: t, size: 20 })] })),
  new Paragraph({ spacing: { before: 160, after: 60 }, children: [new TextRun({ text: "ALL STAGES", bold: true, size: 16, color: NAVY, shading: { type: ShadingType.CLEAR, fill: TEALBG } }), new TextRun({ text: "   Every company answers.", size: 18, color: SLATE })] }),
  new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: "GROWTH", bold: true, size: 16, color: "FFFFFF", shading: { type: ShadingType.CLEAR, fill: NAVY } }), new TextRun({ text: "   Series B or later, or companies with meaningful revenue.", size: 18, color: SLATE })] }),
  new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Company information")] }),
  new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: [3400, 5960], rows: D.company.map((l) => new TableRow({ children: [
    new TableCell({ borders, width: { size: 3400, type: WidthType.DXA }, margins: mg, shading: { type: ShadingType.CLEAR, fill: FILL }, children: [p(l, { size: 18, color: SLATE, after: 0, bold: true })] }),
    new TableCell({ borders, width: { size: 5960, type: WidthType.DXA }, margins: mg, children: [new Paragraph("")] }),
  ] })) }),
  new Paragraph({ children: [new PageBreak()] }),
  new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun("Sections")] }),
  ...D.sections.map((s, i) => new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: CW }], spacing: { after: 60 }, children: [new TextRun({ text: `${i + 1}. ${s.title}`, size: 20 }), new TextRun({ text: `\t${s.questions.length} questions`, size: 18, color: SLATE })] })),
  new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: CW }], spacing: { after: 60 }, children: [new TextRun({ text: "Certification", size: 20 }), new TextRun({ text: "\tSignature", size: 18, color: SLATE })] }),
];

const body = [];
D.sections.forEach((s, si) => {
  body.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(`${si + 1}. ${s.title}`)] }));
  body.push(new Paragraph({ keepNext: true, spacing: { after: 160 }, children: [new TextRun({ text: s.intro, size: 18, color: SLATE })] }));
  const rows = [];
  s.questions.forEach((q, qi) => {
    const growth = q.stage === "Growth";
    const qp = [new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: q.q, size: 20 }), new TextRun({ text: "  " }), new TextRun({ text: growth ? " GROWTH " : " ALL\u00A0STAGES ", bold: true, size: 14, color: growth ? "FFFFFF" : NAVY, shading: { type: ShadingType.CLEAR, fill: growth ? NAVY : TEALBG } })] })];
    if (q.docs) qp.push(new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: "Please provide: ", bold: true, size: 17, color: SLATE }), new TextRun({ text: q.docs, size: 17, color: SLATE }), new TextRun({ text: "     \u2610 Attached   \u2610 In data room   \u2610 Not applicable", size: 17, color: SLATE })] }));
    const resp = [new Paragraph({ shading: { type: ShadingType.CLEAR, fill: FILL }, spacing: { before: 120, after: 0 }, children: [new TextRun({ text: "Response:", size: 16, color: SLATE, bold: true })] }),
      ...[0, 1, 2].map(() => new Paragraph({ shading: { type: ShadingType.CLEAR, fill: FILL }, spacing: { after: 0 }, children: [new TextRun({ text: "", size: 20 })] }))];
    rows.push(new TableRow({ cantSplit: true, children: [
      new TableCell({ borders, width: { size: NUMW, type: WidthType.DXA }, margins: mg, children: [p(`${si + 1}.${qi + 1}`, { bold: true, color: NAVY, after: 0 })] }),
      new TableCell({ borders, width: { size: QW, type: WidthType.DXA }, margins: { ...mg, bottom: 120 }, children: [...qp, ...resp] }),
    ] }));
  });
  body.push(new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: [NUMW, QW], rows }));
});
body.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun("Certification")] }));
body.push(p(D.cert, { after: 240 }));
body.push(new Table({ width: { size: CW, type: WidthType.DXA }, columnWidths: [2400, 6960], rows: D.certFields.map((l) => new TableRow({ height: { value: l === "Signature" ? 900 : 560, rule: HeightRule.ATLEAST }, children: [
  new TableCell({ borders, width: { size: 2400, type: WidthType.DXA }, margins: mg, verticalAlign: VerticalAlign.CENTER, shading: { type: ShadingType.CLEAR, fill: FILL }, children: [p(l, { bold: true, color: SLATE, size: 18, after: 0 })] }),
  new TableCell({ borders, width: { size: 6960, type: WidthType.DXA }, margins: mg, children: [new Paragraph("")] }),
] })) }));

const doc = new Document({
  creator: "Harmonious", title: D.title, description: "Due diligence questionnaire for portfolio companies",
  styles: {
    default: { document: { run: { font: "Arial", size: 20, color: INK } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 30, bold: true, color: NAVY, font: "Arial" }, paragraph: { spacing: { before: 360, after: 80 }, keepNext: true, outlineLevel: 0, border: { left: { style: BorderStyle.SINGLE, size: 24, color: TEAL, space: 8 } } } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 24, bold: true, color: NAVY, font: "Arial" }, paragraph: { spacing: { before: 240, after: 120 }, keepNext: true, outlineLevel: 1 } },
    ],
  },
  numbering: { config: [{ reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 300 } } } }] }] },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1260, right: 1440, bottom: 1260, left: 1440 } }, titlePage: true },
    headers: { default: new Header({ children: [new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: CW }], border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: TEAL, space: 4 } }, children: [new TextRun({ text: "Harmonious", bold: true, size: 16, color: NAVY }), new TextRun({ text: `\t${D.title}`, size: 16, color: SLATE })] })] }), first: new Header({ children: [new Paragraph("")] }) },
    footers: { default: new Footer({ children: [new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: CW }], children: [new TextRun({ text: "Harmonious · harmonious.co", size: 15, color: SLATE }), new TextRun({ children: ["\tPage ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES], size: 15, color: SLATE })] })] }), first: new Footer({ children: [new Paragraph("")] }) },
    children: [...cover, ...body],
  }],
});
Packer.toBuffer(doc).then((buf) => fs.writeFileSync("out/Harmonious-Portfolio-Company-DDQ.docx", buf));
