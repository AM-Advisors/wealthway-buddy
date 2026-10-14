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
  readonly provider: "box" | "google_drive" | "harmonious_storage";
  listFolder(folderId: string): Promise<ProviderItem[]>;
  getContent(fileId: string): Promise<{ bytes: Uint8Array; mimeType: string; name: string }>;
}

export class ProviderNotAuthorizedError extends Error {}

type SourceRow = { provider: "box" | "google_drive" | "harmonious_storage"; connection_reference: string; allowed_root_ids: string[] };

export function providerFor(source: SourceRow): DocumentProvider {
  if (source.connection_reference.startsWith("synthetic:") && source.provider !== "harmonious_storage")
    return syntheticProvider(source.provider, source.connection_reference);
  // Copies held in Harmonious's own private bucket, restricted to approved path prefixes.
  if (source.provider === "harmonious_storage" && source.connection_reference === "storage:portal-tax-documents")
    return harmoniousStorageProvider(source.allowed_root_ids);
  // Live Box: read-only, scoped to a shared link approved per source (Super Admin approved, Founders Fund K-1s).
  if (source.provider === "box" && source.connection_reference.startsWith("box-shared:"))
    return boxSharedProvider(source.connection_reference.slice("box-shared:".length), source.allowed_root_ids);
  throw new ProviderNotAuthorizedError(
    "This document source is not authorized for live access.",
  );
}

// ------------------------------------------------- Harmonious storage --

const STORAGE_BUCKET = "portal-tax-documents";

function harmoniousStorageProvider(allowedPrefixes: string[]): DocumentProvider {
  const inScope = (path: string) =>
    !path.includes("..") && allowedPrefixes.some((p) => p.length > 0 && path.startsWith(p.endsWith("/") ? p : `${p}/`));
  return {
    provider: "harmonious_storage",
    async listFolder() {
      return [];
    },
    async getContent(fileId) {
      if (!inScope(fileId)) throw new ProviderNotAuthorizedError("File is outside the approved storage folder.");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data, error } = await supabaseAdmin.storage.from(STORAGE_BUCKET).download(fileId);
      if (error || !data) throw new Error("Stored document unavailable.");
      return { bytes: new Uint8Array(await data.arrayBuffer()), mimeType: "application/pdf", name: fileId.split("/").pop() ?? "document.pdf" };
    },
  };
}

// ------------------------------------------------------------ live Box --

async function boxToken(): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env["BOX_CLIENT_ID"] ?? "",
    client_secret: process.env["BOX_CLIENT_SECRET"] ?? "",
    box_subject_type: "enterprise",
    box_subject_id: process.env["BOX_ENTERPRISE_ID"] ?? "",
  });
  const r = await fetch("https://api.box.com/oauth2/token", { method: "POST", body });
  if (!r.ok) throw new Error(`Box sign-in failed [${r.status}]`);
  return ((await r.json()) as any).access_token as string;
}

function boxSharedProvider(sharedLink: string, allowedRoots: string[]): DocumentProvider {
  const headers = async () => ({ Authorization: `Bearer ${await boxToken()}`, BoxApi: `shared_link=${sharedLink}` });
  const assertInScope = async (h: Record<string, string>, fileId: string) => {
    const r = await fetch(`https://api.box.com/2.0/files/${encodeURIComponent(fileId)}?fields=name,path_collection`, { headers: h });
    if (!r.ok) throw new Error(`Box file lookup failed [${r.status}]`);
    const j: any = await r.json();
    const ancestors = ((j.path_collection?.entries ?? []) as any[]).map((e) => String(e.id));
    if (!allowedRoots.some((root) => ancestors.includes(root))) throw new ProviderNotAuthorizedError("File is outside the approved Box folder.");
    return String(j.name);
  };
  return {
    provider: "box",
    async listFolder(folderId) {
      const h = await headers();
      const r = await fetch(`https://api.box.com/2.0/folders/${encodeURIComponent(folderId)}/items?limit=1000&fields=id,name,type,size,sha1,modified_at,file_version`, { headers: h });
      if (!r.ok) throw new Error(`Box listing failed [${r.status}]`);
      return (((await r.json()) as any).entries ?? []).map((e: any) => ({
        id: String(e.id), name: e.name, kind: e.type === "folder" ? "folder" : "file", parentId: folderId,
        mimeType: e.type === "folder" ? undefined : "application/pdf", size: e.size, checksum: e.sha1,
        revision: e.file_version?.id, modifiedAt: e.modified_at,
      }));
    },
    async getContent(fileId) {
      const h = await headers();
      const name = await assertInScope(h, fileId);
      const r = await fetch(`https://api.box.com/2.0/files/${encodeURIComponent(fileId)}/content`, { headers: h });
      if (!r.ok) throw new Error(`Box download failed [${r.status}]`);
      return { bytes: new Uint8Array(await r.arrayBuffer()), mimeType: "application/pdf", name };
    },
  };
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
