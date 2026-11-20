/**
 * Send to investors: read one fund-wide document with AI and add it for investors.
 * Only that fund's managers or Harmonious. Reading is in memory and saves nothing;
 * adding goes through the canonical Offering Document engine; holding values go through
 * the existing fund asset and value savers (manager values still wait for Harmonious).
 */
import { generateResponse, GatewayError, PaymentRequiredError, RateLimitError } from "@lovable.dev/ai-gateway";
import { DOC_READ_MAX_BYTES, DOC_READ_TYPES } from "@/lib/investor-doc-extract-model";
import { INVESTOR_DOC_INSTRUCTIONS, INVESTOR_DOC_SCHEMA, matchHolding, normalizeInvestorDocReading, type InvestorDocReading } from "@/lib/investor-update-reader-model";

const MODEL = "openai/gpt-6.1-sol";

async function assertManager(userId: string, offeringId: string) {
  const { setupActor, forbid } = await import("@/lib/fund-setup.server");
  const a = await setupActor(userId);
  if (!a.isStaff && !a.offeringIds.includes(offeringId)) forbid("you do not manage that fund.");
  return a;
}

export type FundHolding = { id: string; asset_name: string; issuer_name: string | null; latestValueCents: number | null; latestValueDate: string | null; pendingMark: { valueCents: number; date: string } | null };

async function fundHoldings(offeringId: string): Promise<FundHolding[]> {
  const { assetsWithMarks } = await import("@/lib/fund-books.server");
  return ((await assetsWithMarks(offeringId)) as any[]).map((a) => ({ id: String(a.id), asset_name: String(a.asset_name), issuer_name: a.issuer_name ?? null, latestValueCents: a.latestValueCents ?? null, latestValueDate: a.latestValueDate ?? null, pendingMark: a.pendingMark ?? null }));
}

export async function readInvestorDocument(userId: string, input: { offeringId: string; fileName: string; contentType: string; base64: string }) {
  const actor = await assertManager(userId, input.offeringId);
  const type = (DOC_READ_TYPES as readonly string[]).includes(input.contentType) ? input.contentType : null;
  if (!type) throw new Error("Only PDFs and photos can be read. You can still add this file without reading it.");
  if (Math.floor((input.base64.length * 3) / 4) > DOC_READ_MAX_BYTES) throw new Error("That file is over 10 MB, so it can't be read. You can still add it without reading it.");
  const file = type === "application/pdf"
    ? { type: "input_file" as const, filename: "document.pdf", file_data: `data:application/pdf;base64,${input.base64}` }
    : { type: "input_image" as const, image_url: `data:${type};base64,${input.base64}`, detail: "high" as const };
  let reading: InvestorDocReading;
  try {
    const res = await generateResponse({
      model: MODEL,
      reasoning: { effort: "low" },
      instructions: INVESTOR_DOC_INSTRUCTIONS,
      input: [{ role: "user", content: [file, { type: "input_text", text: `File name: ${input.fileName.slice(0, 120)}. Return the details as JSON.` }] }],
      text: { format: { type: "json_schema", name: "investor_document", strict: true, schema: INVESTOR_DOC_SCHEMA as unknown as Record<string, unknown> } },
    });
    if (res?.status === "failed" || res?.status === "incomplete") throw new Error("The document couldn't be read. Try a clearer copy.");
    let text = "";
    for (const item of res?.output ?? []) {
      if (item?.type !== "message") continue;
      for (const c of item.content ?? []) {
        if (c?.type === "refusal") throw new Error("This document couldn't be read automatically. You can still add it.");
        if (c?.type === "output_text") text += c.text ?? "";
      }
    }
    if (!text.trim()) throw new Error("The document couldn't be read. Try a clearer copy.");
    reading = normalizeInvestorDocReading(JSON.parse(text));
  } catch (e) {
    if (e instanceof PaymentRequiredError) throw new Error("Document reading is paused because AI credits have run out. You can still add the file.");
    if (e instanceof RateLimitError) throw new Error("Document reading is busy. Wait a minute and try again.");
    if (e instanceof GatewayError) {
      console.error("[investor-doc-read]", e.code, e.httpStatus, e.ids);
      throw new Error(`The document couldn't be read right now [${e.httpStatus ?? e.code}].`);
    }
    if (e instanceof SyntaxError) throw new Error("The document couldn't be read. Try a clearer copy.");
    throw e;
  }
  const holdings = await fundHoldings(input.offeringId);
  return {
    reading,
    staff: actor.isStaff,
    matches: reading.holdings.map((h) => matchHolding(h, holdings)?.id ?? null),
    holdings,
  };
}

export async function addInvestorDocument(userId: string, input: { offeringId: string; docType: "valuation_report" | "investor_update" | "other"; title: string; filePath: string; fileName: string; fileSizeBytes: number; asOfDate?: string | null | undefined }) {
  await assertManager(userId, input.offeringId);
  const { addFundWideReferenceDocument } = await import("@/lib/offering-document-setup.server");
  return addFundWideReferenceDocument(userId, { ...input, effectiveDate: input.asOfDate ?? null });
}
