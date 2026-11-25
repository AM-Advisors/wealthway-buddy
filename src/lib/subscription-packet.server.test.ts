import { describe, expect, it, vi } from "vitest";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef, StandardFonts } from "pdf-lib";
import { mkdir, writeFile } from "node:fs/promises";
vi.mock("@/lib/sealed-records.server", () => ({ sealedIds: async () => new Set<string>() }));
import { buildSubscriptionPacket } from "./subscription-packet.server";

async function fictionalDb(count = 4) {
  const source = await PDFDocument.create();
  const font = await source.embedFont(StandardFonts.Helvetica);
  const p = source.addPage([612, 792]);
  p.drawText("Fictional original document. Content retained.", { x: 54, y: 700, size: 12, font });
  const bytes = await source.save();
  const types = ["ppm", "operating_agreement", "subscription_agreement", "side_letter"];
  const documents = Array.from({ length: count }, (_, i) => ({
    id: `doc-${i}`, title: count > 4 ? `Fictional approved supplemental investor agreement ${i + 1} for the subscription packet` : ["Private Placement Memorandum", "Operating Agreement", "Subscription Agreement", "Side letter"][i],
    doc_type: types[i] ?? "supplement", document_category: types[i] ?? "supplement", usage: i > 1 ? "signature" : "acknowledgment", active_version: 1, removed_at: null,
  }));
  const tables: Record<string, unknown> = {
    offerings: { id: "fictional-fund", name: "Fictional Fund", legal_entity_name: "Fictional Fund, LLC", min_investment_cents: 10000000, fund_signatory_person_id: null },
    offering_documents: documents,
    fund_fee_terms: { management_fee_pct: 1, management_fee_basis: "annual", carry_pct: 10, hurdle_pct: 0 },
    offering_document_versions: documents.map((d) => ({ id: `version-${d.id}`, offering_document_id: d.id, version: 1, file_name: "fictional.pdf", file_path: `${d.id}.pdf`, approval_status: "approved", superseded_at: null })),
  };
  return {
    from: (table: string) => {
      const result = { data: tables[table] ?? null, error: null };
      const chain = { select: () => chain, eq: () => chain, is: () => chain, order: () => chain, limit: () => chain, in: () => chain, maybeSingle: async () => result, then: (done: (value: typeof result) => unknown) => Promise.resolve(result).then(done) };
      return chain;
    },
    storage: { from: () => ({ download: async () => ({ data: new Blob([new Uint8Array(bytes)]), error: null }) }) },
  };
}

async function checkPacket(count: number, fileName: string, wire?: Record<string, string>) {
  const result = await buildSubscriptionPacket(await fictionalDb(count), { fundId: "fictional-fund", ...(wire ? { wire } : {}) });
  const pdf = await PDFDocument.load(result.bytes);
  const pages = pdf.getPages();
  const index = pages[1];
  if (!index) throw new Error("Missing index page");
  const links = index.node.Annots();
  expect(links?.size()).toBeGreaterThan(0);
  const pageRefs = new Set(pages.map((p) => p.ref.toString()));
  let linkCount = 0;
  for (const page of pages) {
    const annotations = page.node.Annots();
    for (let i = 0; i < (annotations?.size() ?? 0); i++) {
      const ref = annotations?.get(i);
      if (!(ref instanceof PDFRef)) throw new Error("Expected link reference");
      const annotation = pdf.context.lookup(ref);
      if (!(annotation instanceof PDFDict)) throw new Error("Expected annotation dictionary");
      const dest = annotation.get(PDFName.of("Dest"));
      if (!(dest instanceof PDFArray)) throw new Error("Expected internal destination");
      expect(pageRefs.has(String(dest.get(0)))).toBe(true);
      linkCount++;
    }
  }
  expect(linkCount).toBeGreaterThanOrEqual(count * 2 + 9);
  expect(result.included).toHaveLength(count);
  expect(result.missing).toEqual([]);
  const output = process.env['PACKET_QA_OUTPUT'];
  if (output) { await mkdir(output, { recursive: true }); await writeFile(`${output}/${fileName}`, result.bytes); }
  return { pdf, pages };
}

describe("Subscription packet generated PDF, fictional records only", () => {
  it("inserts a linked index and checklist without losing any source or tax pages", async () => {
    const { pages } = await checkPacket(4, "standard.pdf");
    // Cover, index, fund summary, instructions and checklist precede the original documents.
    expect(pages.length).toBeGreaterThan(5 + 4 * 2 + 3);
    expect(pages[1]?.node.Annots()?.size()).toBe(12);
    expect(pages[4]?.node.Annots()?.size()).toBe(7);
    expect(pages[3]?.node.Annots()?.size()).toBe(2);
  });
  it("paginates long indexes and checklists with valid destinations after insertion", async () => {
    const { pages } = await checkPacket(32, "long.pdf");
    expect(pages[1]?.node.Annots()?.size()).toBeLessThan(41);
    expect(pages[2]?.node.Annots()?.size()).toBeGreaterThan(0);
  });
  it("indexes wire instructions only when the caller supplies already-authorized details", async () => {
    const { pages } = await checkPacket(4, "with-wire.pdf", { beneficiary: "Fictional beneficiary", reference: "Fictional reference" });
    expect(pages[1]?.node.Annots()?.size()).toBe(13);
  });
});