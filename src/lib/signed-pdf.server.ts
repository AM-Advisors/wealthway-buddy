import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const MARGIN = 56;
const INK = rgb(0.11, 0.13, 0.2);
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
