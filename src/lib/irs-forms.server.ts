/**
 * Populates the OFFICIAL IRS PDF (pinned by SHA-256) with the investor's
 * certified details and appends an electronic-signature record page.
 * No Harmonious imitation of any IRS form is ever produced.
 * Server-only: the populated form may contain a full TIN.
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { currentIrsForm, type TaxFormType } from "@/lib/onboarding-compliance-model";
import { irsFieldValues, type TaxFormFill } from "@/lib/onboarding-intake-model";
import w9 from "@/assets/irs/fw9.pdf.asset.json";
import w8ben from "@/assets/irs/fw8ben.pdf.asset.json";
import w8bene from "@/assets/irs/fw8bene.pdf.asset.json";
import w8eci from "@/assets/irs/fw8eci.pdf.asset.json";
import w8exp from "@/assets/irs/fw8exp.pdf.asset.json";
import w8imy from "@/assets/irs/fw8imy.pdf.asset.json";

const PINNED_COPY: Record<TaxFormType, string> = {
  w9: w9.url, w8ben: w8ben.url, w8bene: w8bene.url, w8eci: w8eci.url, w8exp: w8exp.url, w8imy: w8imy.url,
};

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Fetch the exact pinned official template; refuse anything whose hash differs. */
export async function loadOfficialTemplate(formType: TaxFormType, origin?: string | null): Promise<{ bytes: Uint8Array; sha256: string }> {
  const rev = currentIrsForm(formType);
  const candidates = [origin ? new URL(PINNED_COPY[formType], origin).toString() : null, rev.sourceUrl].filter(Boolean) as string[];
  for (const url of candidates) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const bytes = new Uint8Array(await res.arrayBuffer());
      const sha = await sha256Hex(bytes);
      if (sha === rev.templateSha256) return { bytes, sha256: sha };
    } catch {
      /* try the next copy */
    }
  }
  throw new Error(`The official ${rev.title} (${rev.revision}) could not be loaded with its verified fingerprint. Harmonious must confirm the current IRS revision before this form can be signed.`);
}

export interface SignatureRecord {
  signerName: string;
  signedAtIso: string;
  profileLabel: string;
  classification: string;
  certificationMethod: string;
}

export async function renderOfficialTaxForm(input: {
  formType: TaxFormType;
  template: Uint8Array;
  templateSha256: string;
  fill: TaxFormFill;
  signature: SignatureRecord | null;
}): Promise<Uint8Array> {
  const rev = currentIrsForm(input.formType);
  const doc = await PDFDocument.load(input.template, { ignoreEncryption: true });
  const form = doc.getForm();
  const { text, checks } = irsFieldValues(input.formType, input.fill);
  for (const [name, value] of Object.entries(text)) {
    try {
      form.getTextField(name).setText(value);
    } catch {
      /* field absent in this revision; leave blank */
    }
  }
  for (const name of checks) {
    try {
      form.getCheckBox(name).check();
    } catch {
      /* ignore */
    }
  }
  try {
    form.flatten();
  } catch {
    /* keep fields if flattening fails; values are still set */
  }

  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let y = 740;
  const line = (label: string, value: string, f = font) => {
    page.drawText(label, { x: 56, y, size: 10, font: bold, color: rgb(0.08, 0.15, 0.28) });
    page.drawText(value.slice(0, 90), { x: 220, y, size: 10, font: f, color: rgb(0.13, 0.12, 0.13) });
    y -= 20;
  };
  page.drawText(input.signature ? "Electronic signature record" : "PREVIEW — NOT SIGNED", { x: 56, y, size: 16, font: bold });
  y -= 32;
  line("Form", `${rev.title} (${rev.revision})`);
  line("Official source", rev.sourceUrl);
  line("Template SHA-256", input.templateSha256.slice(0, 64));
  line("Investing profile", input.fill.legalName);
  if (input.signature) {
    line("Tax classification", input.signature.classification);
    line("Signed by", input.signature.signerName);
    line("Signed at (UTC)", input.signature.signedAtIso);
    line("Method", input.signature.certificationMethod);
    y -= 10;
    page.drawText(
      "The signer reviewed the populated official form above and electronically signed it, adopting the certification",
      { x: 56, y, size: 9, font },
    );
    y -= 13;
    page.drawText("printed on the form exactly as issued by the IRS. No Fund Manager countersignature applies.", { x: 56, y, size: 9, font });
  }
  return doc.save();
}

// ------------------------------------------------------------ TIN vault

async function tinKey(): Promise<CryptoKey> {
  const secret = process.env['TAX_TIN_ENCRYPTION_KEY'];
  if (!secret) throw new Error("Secure tax-ID storage is not configured.");
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
const b64 = (u: Uint8Array) => Buffer.from(u).toString("base64");

export async function encryptTin(tin: string): Promise<{ ciphertext: string; iv: string; keyVersion: number }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await tinKey(), new TextEncoder().encode(tin.replace(/\D/g, "")));
  return { ciphertext: b64(new Uint8Array(ct)), iv: b64(iv), keyVersion: 1 };
}

export async function decryptTin(ciphertext: string, iv: string): Promise<string> {
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(Buffer.from(iv, "base64")) },
    await tinKey(),
    new Uint8Array(Buffer.from(ciphertext, "base64")),
  );
  return new TextDecoder().decode(pt);
}
