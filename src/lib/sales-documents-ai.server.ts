/** AI first drafts for proposals/RFPs/RFQs via the Lovable AI Gateway (Responses API, streamed). Never writes prices. */
import type { DocDirection, DocKind, Section } from "@/lib/sales-documents-model";

const RESPONSES_URL = "https://ai.gateway.lovable.dev/v1/responses";
const MODEL = "openai/gpt-6-astra";

const VOICE = "You write for Harmonious (harmonious.co), a fund administration and back-office platform for venture funds, SPVs and their investors (fund setup, investor onboarding and KYC, accounting and NAV, K-1 tax, regulatory filings, banking, cap tables). Voice: clear, confident, warm, professional. Never invent facts, clients, case studies, certifications, numbers or quotes. Never write prices, fees, dollar amounts or percentages - pricing is inserted separately from the approved quote. Where a fact is unknown, write [confirm: ...] for the rep.";

const SCHEMA = {
  type: "object", additionalProperties: false, required: ["sections"],
  properties: { sections: { type: "array", items: { type: "object", additionalProperties: false, required: ["key", "title", "body", "question"], properties: { key: { type: "string" }, title: { type: "string" }, body: { type: "string" }, question: { type: ["string", "null"] } } } } },
};

export async function draftSections(input: {
  kind: DocKind; direction: DocDirection; title: string; brief: string | null;
  context: Record<string, unknown>; sourceText: string | null; sections: Section[];
}): Promise<Section[]> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI isn't configured.");
  const task = input.direction === "outbound"
    ? `Write a ${input.kind.toUpperCase()} that Harmonious sends to vendors. Fill every section listed.`
    : input.sourceText
      ? `Write Harmonious's response to the prospect's ${input.kind.toUpperCase()}. Keep the existing sections, then add one section per question or requirement found in the prospect's document (key "q1", "q2"..., title a short label, question = the prospect's exact question, body = our answer).`
      : `Write a ${input.kind === "proposal" ? "sales proposal" : input.kind.toUpperCase() + " response"} from Harmonious to the prospect. Fill every section listed.`;
  const res = await fetch(RESPONSES_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({
      model: MODEL, stream: true, store: false,
      reasoning: { effort: "low" },
      instructions: `${VOICE}\n${task}\nEach body is plain text paragraphs (use "- " for bullets), under 250 words. Keep section keys unchanged.`,
      input: JSON.stringify({ title: input.title, brief: input.brief, context: input.context, sections: input.sections, prospectDocument: input.sourceText?.slice(0, 40000) ?? null }),
      text: { format: { type: "json_schema", name: "sales_document", strict: true, schema: SCHEMA } },
    }),
  });
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    console.error("sales document AI failed", res.status, body);
    if (res.status === 429) throw new Error("The AI helper is busy. Try again in a minute.");
    if (res.status === 402) throw new Error("AI credits have run out. Add credits in Settings → Plans & credits.");
    if (res.status === 403) throw new Error("The AI helper isn't available for this workspace right now.");
    throw new Error(`AI request failed [${res.status}].`);
  }
  const reader = res.body.getReader(); const dec = new TextDecoder();
  let buf = ""; let text = "";
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const p = line.slice(5).trim(); if (!p || p === "[DONE]") continue;
      try {
        const ev = JSON.parse(p);
        if (ev.type === "response.output_text.delta") text += ev.delta ?? "";
        if (ev.type === "response.failed" || ev.type === "error") throw new Error("The AI helper couldn't finish this draft.");
      } catch (e) { if (e instanceof Error && e.message.startsWith("The AI")) throw e; }
    }
  }
  let parsed: any;
  try { parsed = JSON.parse(text); } catch { throw new Error("The AI helper returned an unreadable draft. Try again."); }
  const out = ((parsed?.sections ?? []) as any[]).filter((s) => s && typeof s.body === "string")
    .map((s, n) => ({ key: String(s.key || `s${n}`), title: String(s.title || "Section"), body: String(s.body), question: s.question ? String(s.question) : null }));
  if (!out.length) throw new Error("The AI helper returned an empty draft.");
  return out;
}
