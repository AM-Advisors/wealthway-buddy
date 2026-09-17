/** Builds a share certificate PDF the company or the shareholder can download. */

import { COMPANY } from "@/lib/company-details";
import { downloadPdfDoc, openPdfDoc, type PdfDocSpec } from "@/lib/pdf-render";

const day = (value: string | null | undefined) =>
  value
    ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "—";

const money = (cents: number | null | undefined) =>
  typeof cents === "number"
    ? (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })
    : "—";

const qty = (value: number | null | undefined) =>
  typeof value === "number" ? value.toLocaleString("en-US", { maximumFractionDigits: 4 }) : "—";

export function certificateFileName(certificate: any) {
  const holder = String(certificate?.snapshot?.holderName ?? "holder").replace(
    /[^A-Za-z0-9]+/g,
    "-",
  );
  return `Share-certificate-${certificate?.certificate_no ?? "draft"}-${holder}.pdf`;
}

export function certificatePdfSpec(certificate: any): PdfDocSpec {
  const s = (certificate?.snapshot ?? {}) as any;

  const statusNote =
    certificate?.status === "issued"
      ? `Signed by ${certificate?.signer_name ?? "—"}${
          certificate?.signer_title ? `, ${certificate.signer_title}` : ""
        } on ${day(certificate?.signed_at)}.`
      : certificate?.status === "cancelled" || certificate?.status === "replaced"
        ? `This certificate was ${certificate.status} on ${day(certificate?.cancelled_at)}${
            certificate?.cancelled_reason ? ` — ${certificate.cancelled_reason}` : ""
          }.`
        : "Draft — not yet signed by the company signatory.";

  return {
    kicker: "Share certificate",
    title: String(s.companyName ?? "Share certificate"),
    subtitle: `Certificate ${certificate?.certificate_no ?? "—"}`,
    badge: String(certificate?.status ?? ""),
    sections: [
      {
        heading: "Holding",
        rows: [
          { label: "Certificate number", value: String(certificate?.certificate_no ?? "—") },
          { label: "Holder", value: String(s.holderName ?? "—") },
          { label: "Security", value: String(s.securityType ?? "—") },
          { label: "Class", value: String(s.shareClass || "—") },
          { label: "Units held", value: qty(s.quantity) },
          { label: "Price per unit", value: money(s.pricePerShareCents) },
          { label: "Issued on", value: day(s.issuedOn) },
          { label: "Verification code", value: String(certificate?.verification_code ?? "—") },
        ],
      },
      { heading: "Status", text: statusNote },
    ],
    notes: [
      `This certificate reflects the company's own cap table records held on the ${COMPANY.name} platform. ${COMPANY.name} maintains these records administratively and is not the company's transfer agent, registrar, counsel or auditor.`,
    ],
    fileName: certificateFileName(certificate),
  };
}

export async function downloadCertificate(certificate: any) {
  await downloadPdfDoc(certificatePdfSpec(certificate));
}

export async function openCertificate(certificate: any) {
  return await openPdfDoc(certificatePdfSpec(certificate));
}
