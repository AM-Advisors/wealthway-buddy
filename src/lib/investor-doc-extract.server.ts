/**
 * Reads one uploaded investor document with AI and returns suggested details.
 * Staff or that fund's own managers only (same check as adding an investor).
 * The file is read in memory and never stored; tax ID, account and document
 * numbers are excluded by the prompt, the schema and a final redaction pass.
 */
import { generateResponse, GatewayError, PaymentRequiredError, RateLimitError } from "@lovable.dev/ai-gateway";
import { DOC_READ_MAX_BYTES, DOC_READ_TYPES, EXTRACT_INSTRUCTIONS, EXTRACT_SCHEMA, normalizeReading, type DocumentReading } from "@/lib/investor-doc-extract-model";

const MODEL = "openai/gpt-6.1-sol";

export async function readNewInvestorDocument(userId: string, input: { offeringId: string; fileName: string; contentType: string; base64: string }): Promise<DocumentReading> {
  const { onboardingActor } = await import("@/lib/investor-onboarding.server");
  const { canManageFundRecords } = await import("@/lib/investor-record-model");
  const actor = await onboardingActor(userId);
  if (!canManageFundRecords(actor, input.offeringId)) throw new Error("Forbidden: you do not manage that fund.");

  const type = (DOC_READ_TYPES as readonly string[]).includes(input.contentType) ? input.contentType : null;
  if (!type) throw new Error("Upload a PDF or a photo (PNG, JPG or WEBP).");
  if (Math.floor((input.base64.length * 3) / 4) > DOC_READ_MAX_BYTES) throw new Error("That file is over 10 MB. Upload a smaller copy.");

  const file = type === "application/pdf"
    ? { type: "input_file" as const, filename: "document.pdf", file_data: `data:application/pdf;base64,${input.base64}` }
    : { type: "input_image" as const, image_url: `data:${type};base64,${input.base64}`, detail: "high" as const };
  try {
    const res = await generateResponse({
      model: MODEL,
      reasoning: { effort: "low" },
      instructions: EXTRACT_INSTRUCTIONS,
      input: [{ role: "user", content: [file, { type: "input_text", text: `File name: ${input.fileName.slice(0, 120)}. Return the investor details as JSON.` }] }],
      text: { format: { type: "json_schema", name: "investor_details", strict: true, schema: EXTRACT_SCHEMA as unknown as Record<string, unknown> } },
    });
    if (res?.status === "failed" || res?.status === "incomplete") throw new Error("The document couldn't be read. Try a clearer copy.");
    let text = "";
    for (const item of res?.output ?? []) {
      if (item?.type !== "message") continue;
      for (const c of item.content ?? []) {
        if (c?.type === "refusal") throw new Error("This document couldn't be read automatically. Enter the details by hand.");
        if (c?.type === "output_text") text += c.text ?? "";
      }
    }
    if (!text.trim()) throw new Error("The document couldn't be read. Try a clearer copy.");
    return normalizeReading(JSON.parse(text));
  } catch (e) {
    if (e instanceof PaymentRequiredError) throw new Error("Document reading is paused because AI credits have run out.");
    if (e instanceof RateLimitError) throw new Error("Document reading is busy. Wait a minute and try this file again.");
    if (e instanceof GatewayError) {
      console.error("[investor-doc-extract]", e.code, e.httpStatus, e.ids);
      throw new Error(`The document couldn't be read right now [${e.httpStatus ?? e.code}].`);
    }
    if (e instanceof SyntaxError) throw new Error("The document couldn't be read. Try a clearer copy.");
    throw e;
  }
}
