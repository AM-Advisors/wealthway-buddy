/**
 * Read-only document providers for historical portal documents (Box, Google Drive).
 *
 * The interface has NO upload, move, rename, share or delete operations by design.
 * It is deliberately separate from box.server.ts (Box Sign / filing), which can write.
 * Live Box/Drive historical connections are not authorized yet (Phase C): any source
 * whose connection_reference is not a synthetic fixture is refused here.
 */

export type ProviderItem = {
  id: string;
  name: string;
  kind: "folder" | "file";
  parentId: string;
  mimeType?: string | undefined;
  size?: number | undefined;
  checksum?: string | undefined;
  revision?: string | undefined;
  modifiedAt?: string | undefined;
};

export interface DocumentProvider {
  readonly provider: "box" | "google_drive";
  listFolder(folderId: string): Promise<ProviderItem[]>;
  getContent(fileId: string): Promise<{ bytes: Uint8Array; mimeType: string; name: string }>;
}

export class ProviderNotAuthorizedError extends Error {}

type SourceRow = { provider: "box" | "google_drive"; connection_reference: string; allowed_root_ids: string[] };

export function providerFor(source: SourceRow): DocumentProvider {
  if (source.connection_reference.startsWith("synthetic:")) return syntheticProvider(source.provider, source.connection_reference);
  throw new ProviderNotAuthorizedError(
    "Live Box and Google Drive historical-document connections are not authorized yet. Phase C requires separate approval.",
  );
}

// ------------------------------------------------------------- synthetic --

type Node = { id: string; name: string; parent: string; folder?: boolean; checksum?: string; modified?: string };

const SYNTHETIC: Record<string, Node[]> = {
  "synthetic:box-historical-a": [
    { id: "syn-box-wt", name: "TEST Harmonious Walkthrough Fund", parent: "syn-box-root", folder: true },
    { id: "syn-box-wt-avery", name: "Avery Testinvestor", parent: "syn-box-wt", folder: true },
    { id: "syn-box-wt-blake", name: "Blake Test Holdings LLC", parent: "syn-box-wt", folder: true },
    { id: "syn-box-wt-casey", name: "Casey Test Family Trust", parent: "syn-box-wt", folder: true },
    { id: "syn-box-f1", name: "K-1 2024 Avery Testinvestor.pdf", parent: "syn-box-wt-avery", checksum: "syn-sha-a24" },
    { id: "syn-box-f2", name: "K-1 2025 Avery Testinvestor.pdf", parent: "syn-box-wt-avery", checksum: "syn-sha-a25" },
    { id: "syn-box-f3", name: "Blake Test Holdings K-1 2025.pdf", parent: "syn-box-wt-blake", checksum: "syn-sha-b25" },
    { id: "syn-box-f4", name: "Casey Trust K-1 2025.pdf", parent: "syn-box-wt-casey", checksum: "syn-sha-c25" },
    { id: "syn-box-f5", name: "Casey Trust K-1.pdf", parent: "syn-box-wt-casey", checksum: "syn-sha-cxx" },
    { id: "syn-box-f6", name: "K-1 2025 - unsorted.pdf", parent: "syn-box-wt", checksum: "syn-sha-u25" },
    { id: "syn-box-f7", name: "Blake Test Holdings K-1 2024.pdf", parent: "syn-box-wt", checksum: "syn-sha-b24" },
  ],
  "synthetic:drive-historical-a": [
    { id: "syn-drive-portal", name: "TEST Portal Walkthrough Fund I", parent: "syn-drive-root", folder: true },
    { id: "syn-drive-portal-wi", name: "Walkthrough Investor", parent: "syn-drive-portal", folder: true },
    { id: "syn-drive-wt-northwind", name: "Northwind Family Office LLC", parent: "syn-drive-root", folder: true },
    { id: "syn-drive-f1", name: "Walkthrough Investor K-1 2025.pdf", parent: "syn-drive-portal-wi", checksum: "syn-sha-w25" },
    { id: "syn-drive-f2", name: "Walkthrough Investor K-1 2024.pdf", parent: "syn-drive-portal-wi", checksum: "syn-sha-w24" },
    { id: "syn-drive-f3", name: "Northwind K-1 2025.pdf", parent: "syn-drive-wt-northwind", checksum: "syn-sha-n25" },
    { id: "syn-drive-f4", name: "Copy of Blake K-1 2025.pdf", parent: "syn-drive-wt-northwind", checksum: "syn-sha-b25" },
    { id: "syn-drive-f5", name: "Old scan K-1 2023.pdf", parent: "syn-drive-root", checksum: "syn-sha-o23" },
  ],
};

function syntheticProvider(provider: "box" | "google_drive", ref: string): DocumentProvider {
  const nodes = SYNTHETIC[ref] ?? [];
  return {
    provider,
    async listFolder(folderId) {
      return nodes.filter((n) => n.parent === folderId).map((n) => ({
        id: n.id,
        name: n.name,
        kind: n.folder ? "folder" : "file",
        parentId: n.parent,
        mimeType: n.folder ? undefined : "application/pdf",
        size: n.folder ? undefined : 900,
        checksum: n.checksum,
        revision: "1",
        modifiedAt: "2026-03-15T00:00:00Z",
      }));
    },
    async getContent(fileId) {
      const n = nodes.find((x) => x.id === fileId && !x.folder);
      if (!n) throw new Error("File not found in source.");
      return { bytes: syntheticPdf(n.name), mimeType: "application/pdf", name: n.name };
    },
  };
}

/** A tiny one-page PDF clearly marked as a synthetic test document. */
export function syntheticPdf(title: string): Uint8Array {
  const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const text = `BT /F1 18 Tf 60 720 Td (SYNTHETIC TEST DOCUMENT - NOT A REAL K-1) Tj 0 -32 Td /F1 12 Tf (${esc(title)}) Tj 0 -20 Td (Fictional data for Harmonious portal testing only.) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(out);
}
