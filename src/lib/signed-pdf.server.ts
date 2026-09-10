import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const MARGIN = 56;
const INK = rgb(0.078, 0.149, 0.278); // brand navy #142647
const MUTED = rgb(0.42, 0.44, 0.5);

function wrap(text: string, font: any, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of paragraph.split(/\s+/)) {
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

export async function buildSignedPdf(input: {
  title: string;
  body: string;
  signerName: string;
  initials: string;
  signedAt: string;
  documentHash: string;
  commitmentCents: number;
  ownershipTitle: string;
  ipAddress: string | null;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  let page = pdf.addPage();
  let { width, height } = page.getSize();
  const maxWidth = width - MARGIN * 2;
  let y = height - MARGIN;

  const draw = (text: string, font: any, size: number, color = INK) => {
    for (const line of wrap(text, font, size, maxWidth)) {
      if (y < MARGIN + 60) {
        page = pdf.addPage();
        ({ width, height } = page.getSize());
        y = height - MARGIN;
      }
      page.drawText(line, { x: MARGIN, y, size, font, color });
      y -= size * 1.5;
    }
  };

  draw(input.title, bold, 18);
  y -= 8;
  draw(`Executed ${new Date(input.signedAt).toUTCString()}`, italic, 10, MUTED);
  y -= 12;
  draw(input.body, regular, 11);

  y -= 20;
  draw("Subscription particulars", bold, 13);
  draw(`Commitment: $${(input.commitmentCents / 100).toLocaleString("en-US")}`, regular, 11);
  draw(`Title to be held as: ${input.ownershipTitle}`, regular, 11);

  y -= 20;
  draw("Electronic signature", bold, 13);
  draw(`Signed by: ${input.signerName}`, regular, 11);
  draw(`Initials: ${input.initials}`, regular, 11);
  draw(
    "The signer consented to transact electronically under the U.S. E-SIGN Act and adopted the signature above as their legally binding signature.",
    regular,
    10,
    MUTED,
  );
  draw(`Timestamp (UTC): ${input.signedAt}`, regular, 10, MUTED);
  draw(`IP address: ${input.ipAddress ?? "unavailable"}`, regular, 10, MUTED);
  draw(`Document SHA-256: ${input.documentHash}`, regular, 9, MUTED);

  return pdf.save();
}

export type PlacedBlock = {
  page_number: number;
  x: number;
  y: number;
  width: number;
  height: number;
  block_type: "signature" | "initials" | "date" | "full_name" | "title";
};

/**
 * Stamps the signer's details into the blocks the client placed on the fund's
 * own uploaded PDF, then appends the standard electronic-signature record.
 */
export async function stampSignedPdf(input: {
  fileBytes: Uint8Array;
  blocks: PlacedBlock[];
  signerName: string;
  initials: string;
  ownershipTitle: string;
  signedAt: string;
  documentHash: string;
  commitmentCents: number;
  ipAddress: string | null;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(input.fileBytes);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const script = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pages = pdf.getPages();
  const signedDate = new Date(input.signedAt).toLocaleDateString("en-US");

  const valueFor = (type: PlacedBlock["block_type"]) => {
    if (type === "signature") return input.signerName;
    if (type === "initials") return input.initials;
    if (type === "date") return signedDate;
    if (type === "full_name") return input.signerName;
    return input.ownershipTitle || "";
  };

  for (const block of input.blocks) {
    const page = pages[block.page_number - 1];
    if (!page) continue;
    const { width, height } = page.getSize();
    const boxWidth = block.width * width;
    const boxHeight = block.height * height;
    const left = block.x * width;
    const bottom = height - (block.y + block.height) * height;
    const text = valueFor(block.block_type);
    if (!text) continue;

    const font = block.block_type === "signature" ? script : regular;
    let size = Math.min(boxHeight * 0.7, 16);
    while (size > 5 && font.widthOfTextAtSize(text, size) > boxWidth) size -= 0.5;

    page.drawText(text, {
      x: left + 2,
      y: bottom + Math.max(2, (boxHeight - size) / 2),
      size,
      font,
      color: INK,
    });
    page.drawLine({
      start: { x: left, y: bottom },
      end: { x: left + boxWidth, y: bottom },
      thickness: 0.5,
      color: MUTED,
    });
  }

  const record = pdf.addPage();
  const { width: rw, height: rh } = record.getSize();
  let y = rh - MARGIN;
  const line = (text: string, font: any, size: number, color = INK) => {
    for (const part of wrap(text, font, size, rw - MARGIN * 2)) {
      record.drawText(part, { x: MARGIN, y, size, font, color });
      y -= size * 1.5;
    }
  };

  line("Electronic signature record", bold, 16);
  y -= 8;
  line(`Signed by: ${input.signerName}`, regular, 11);
  line(`Initials: ${input.initials}`, regular, 11);
  line(`Title to be held as: ${input.ownershipTitle}`, regular, 11);
  line(`Commitment: $${(input.commitmentCents / 100).toLocaleString("en-US")}`, regular, 11);
  y -= 10;
  line(
    "The signer consented to transact electronically under the U.S. E-SIGN Act and adopted the signature above as their legally binding signature.",
    regular,
    10,
    MUTED,
  );
  line(`Timestamp (UTC): ${input.signedAt}`, regular, 10, MUTED);
  line(`IP address: ${input.ipAddress ?? "unavailable"}`, regular, 10, MUTED);
  line(`Document SHA-256: ${input.documentHash}`, regular, 9, MUTED);

  return pdf.save();
}
