/**
 * Contract reading (server-only). Reads text from the unchanged original file,
 * asks the AI gateway to propose terms with page/section references, and returns
 * normalized proposals. Nothing here writes operational configuration.
 */
import { unzipSync, strFromU8 } from "fflate";

import {
  EXTRACTION_PROMPT_VERSION,
  TERM_CATALOG,
  normalizeExtraction,
  readableQuality,
  type NormalizedTerm,
} from "@/lib/contract-ingestion";

export const EXTRACTION_MODEL = "google/gemini-2.5-flash";

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Pages of text. DOCX has no pages, so it returns one "page" with section markers kept. */
export async function readDocumentText(
  bytes: Uint8Array,
  kind: "pdf" | "docx",
): Promise<{ pages: string[]; chars: number }> {
  if (kind === "pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: false });
    const pages = (Array.isArray(text) ? text : [text]).map((p) => String(p ?? ""));
    return { pages, chars: pages.join("").replace(/\s/g, "").length };
  }
  const files = unzipSync(bytes, { filter: (f) => f.name === "word/document.xml" });
  const xml = files["word/document.xml"];
  if (!xml) throw new Error("This Word file couldn't be read.");
  const text = strFromU8(xml)
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
  return { pages: [text], chars: text.replace(/\s/g, "").length };
}

const SYSTEM = `You extract terms from a services agreement for human review. Rules:
- Never invent a term. If the document does not state it, return basis "not_found" and value null.
- basis "explicit" only when the wording appears in the document; quote it verbatim (short).
- basis "inferred" when you classify or derive something not stated word-for-word.
- Silence is never permission. Do not draw legal conclusions; for liability/indemnification give a neutral one-line reference only.
- Do not decide precedence. Only report a precedence clause if the text states one.
- Signature blocks alone do not mean the document is executed; report who signed and dates exactly as shown.
- Money values: keep the exact wording including "$" amounts.
- page = the page number from the [Page N] markers; section = the heading or clause number.
- confidence 0..1 reflects how clearly the text supports the value.`;

export async function extractTerms(pages: string[]): Promise<{ terms: NormalizedTerm[]; raw: unknown }> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("Contract reading is not configured.");
  const body = pages
    .map((p, i) => `[Page ${i + 1}]\n${p}`)
    .join("\n\n")
    .slice(0, 400_000);
  const keys = TERM_CATALOG.map((t) => `${t.key}: ${t.label}`).join("\n");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: EXTRACTION_MODEL,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Terms to find (use these keys):\n${keys}\n\nDocument:\n${body}` },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "report_terms",
            description: "Report every requested term.",
            parameters: {
              type: "object",
              properties: {
                terms: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      key: { type: "string", enum: TERM_CATALOG.map((t) => t.key) },
                      value: { type: ["string", "null"] },
                      basis: { type: "string", enum: ["explicit", "inferred", "not_found"] },
                      confidence: { type: ["number", "null"] },
                      page: { type: ["string", "null"] },
                      section: { type: ["string", "null"] },
                      quote: { type: ["string", "null"] },
                    },
                    required: ["key", "value", "basis"],
                  },
                },
              },
              required: ["terms"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "report_terms" } },
    }),
  });
  if (res.status === 429) throw new Error("Contract reading is busy — try again in a minute.");
  if (res.status === 402) throw new Error("AI credits are exhausted — add credits to read contracts.");
  if (!res.ok) throw new Error(`Contract reading failed (${res.status}).`);
  const json: any = await res.json();
  const args = json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  let raw: unknown = {};
  try {
    raw = typeof args === "string" ? JSON.parse(args) : (args ?? {});
  } catch {
    raw = {};
  }
  return { terms: normalizeExtraction(raw), raw };
}

export { EXTRACTION_PROMPT_VERSION, readableQuality };
