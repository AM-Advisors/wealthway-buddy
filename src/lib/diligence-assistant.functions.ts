import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AssistantCitation = {
  document_id: string;
  title: string;
  quote: string;
  page: number | null;
};

export type AssistantAnswer = {
  answer: string;
  citations: AssistantCitation[];
  sources_used: { id: string; title: string }[];
};

const MAX_DOCS = 8;
const MAX_CHARS_PER_DOC = 14000;
const MAX_BYTES_PER_DOC = 15 * 1024 * 1024;

const textCache = new Map<string, string>();

async function extractText(boxFileId: string, fileName: string, sizeBytes: number | null) {
  const cached = textCache.get(boxFileId);
  if (cached !== undefined) return cached;
  const ext = (fileName ?? "").toLowerCase().split(".").pop() ?? "";
  if (!["pdf", "txt", "md", "csv"].includes(ext)) return "";
  if (Number(sizeBytes ?? 0) > MAX_BYTES_PER_DOC) return "";

  const { downloadFile } = await import("@/lib/box.server");
  let out = "";
  try {
    const bytes = await downloadFile(boxFileId);
    if (ext === "pdf") {
      const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      const { text } = await pdfText(pdf, { mergePages: false });
      out = (Array.isArray(text) ? text : [String(text)])
        .map((page, i) => `[page ${i + 1}] ${String(page).replace(/\s+/g, " ").trim()}`)
        .join("\n");
    } else {
      out = new TextDecoder().decode(bytes);
    }
  } catch {
    out = "";
  }
  out = out.slice(0, MAX_CHARS_PER_DOC);
  textCache.set(boxFileId, out);
  return out;
}

/**
 * Answers an investor question using only the documents that the signed-in
 * person is allowed to see (row level security plus the NDA gate apply here),
 * and returns the passages it relied on so the answer can be checked.
 */
export const askDiligenceAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        offering_id: z.string().uuid(),
        question: z.string().trim().min(3).max(1000),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<AssistantAnswer> => {
    const { supabase, userId } = context;

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("The assistant is not configured yet.");

    const { data: room } = await supabase
      .from("diligence_rooms")
      .select("id, intro, entity_type")
      .eq("offering_id", data.offering_id)
      .maybeSingle();

    const { data: offering } = await supabase
      .from("offerings")
      .select("name, summary, reg_type, min_investment_cents, target_raise_cents, is_open")
      .eq("id", data.offering_id)
      .maybeSingle();
    if (!offering) throw new Error("That fund is not available to you.");

    const { data: docs } = await supabase
      .from("diligence_documents")
      .select("id, title, category, description, file_name, size_bytes, box_file_id")
      .eq("offering_id", data.offering_id)
      .order("uploaded_at", { ascending: false })
      .limit(MAX_DOCS);

    const documents = docs ?? [];
    if (documents.length === 0) {
      throw new Error(
        "There are no documents you can read in this room yet, so the assistant has nothing to answer from.",
      );
    }

    const { data: capRows } = await supabase
      .from("diligence_cap_table")
      .select("holder_name, holder_type, security_type, shares, ownership_pct, fully_diluted_pct")
      .eq("offering_id", data.offering_id)
      .order("sort_order", { ascending: true });

    const extracted = await Promise.all(
      documents.map(async (d: any) => ({
        id: d.id as string,
        title: d.title as string,
        category: d.category as string,
        text: await extractText(d.box_file_id, d.file_name, d.size_bytes),
      })),
    );
    const usable = extracted.filter((d) => d.text.trim().length > 40);

    const capText = (capRows ?? []).length
      ? `\n\nCAPITALISATION TABLE (live data in the room):\n${(capRows ?? [])
          .map(
            (r: any) =>
              `- ${r.holder_name} (${r.holder_type}, ${r.security_type}): ${r.shares ?? "n/a"} units, ${r.ownership_pct ?? "n/a"}% owned, ${r.fully_diluted_pct ?? "n/a"}% fully diluted`,
          )
          .join("\n")}`
      : "";

    const corpus = usable
      .map(
        (d) =>
          `=== DOCUMENT id=${d.id} | title="${d.title}" | section=${d.category} ===\n${d.text}`,
      )
      .join("\n\n");

    const listing = documents
      .map((d: any) => `- id=${d.id} "${d.title}" (${d.category})`)
      .join("\n");

    const system = `You are the diligence assistant for ${offering.name}, a ${offering.reg_type} offering on the Harmonious platform.
Answer only from the material supplied below. If the answer is not in it, say plainly that the room does not cover it and suggest asking the fund team through the Questions tab.
Never invent figures, dates or names. Keep answers short, factual and readable by a non-specialist investor.
Every factual claim must be backed by a citation: a document id from the list, plus a short verbatim quote (max 40 words) copied from that document.
Return strict JSON only: {"answer": string, "citations": [{"document_id": string, "quote": string, "page": number|null}]}.`;

    const contextBlock = `FUND SUMMARY: ${offering.summary ?? "none provided"}
Minimum investment: ${offering.min_investment_cents ? `$${(Number(offering.min_investment_cents) / 100).toLocaleString()}` : "not stated"}
Target raise: ${offering.target_raise_cents ? `$${(Number(offering.target_raise_cents) / 100).toLocaleString()}` : "not stated"}
Room introduction: ${room?.intro ?? "none"}${capText}

DOCUMENTS AVAILABLE TO THIS READER:
${listing}

DOCUMENT CONTENTS:
${corpus || "(no readable text could be extracted from the documents)"}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: "google/gemini-3.8-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: `${contextBlock}\n\nINVESTOR QUESTION: ${data.question}` },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      if (res.status === 429) throw new Error("The assistant is busy right now — try again shortly.");
      if (res.status === 402)
        throw new Error("The assistant is out of credits. Ask the fund team to top up.");
      throw new Error(`The assistant could not answer right now. (${res.status}) ${body.slice(0, 200)}`);
    }

    const payload: any = await res.json();
    const raw = payload?.choices?.[0]?.message?.content ?? "";
    let parsed: any = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { answer: String(raw || "").trim(), citations: [] };
    }

    const byId = new Map(documents.map((d: any) => [d.id, d.title as string]));
    const citations: AssistantCitation[] = Array.isArray(parsed.citations)
      ? parsed.citations
          .filter((c: any) => c && byId.has(c.document_id))
          .slice(0, 6)
          .map((c: any) => ({
            document_id: String(c.document_id),
            title: byId.get(c.document_id) as string,
            quote: String(c.quote ?? "").slice(0, 400),
            page: Number.isFinite(Number(c.page)) ? Number(c.page) : null,
          }))
      : [];

    const answer =
      String(parsed.answer ?? "").trim() ||
      "I could not find an answer in the documents in this room.";

    const { data: who } = await supabase
      .from("profiles")
      .select("legal_name, email")
      .eq("user_id", userId)
      .maybeSingle();

    await supabase.from("diligence_activity").insert({
      room_id: room?.id ?? null,
      offering_id: data.offering_id,
      actor_id: userId,
      actor_name: who?.legal_name ?? null,
      actor_email: who?.email ?? null,
      event_type: "assistant_question",
      summary: `Asked the assistant: “${data.question.slice(0, 140)}”`,
      metadata: {
        question: data.question,
        cited: citations.map((c) => c.document_id),
      },
    });

    return {
      answer,
      citations,
      sources_used: usable.map((d) => ({ id: d.id, title: d.title })),
    };
  });
