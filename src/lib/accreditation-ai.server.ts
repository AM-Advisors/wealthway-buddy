/**
 * AI pre-check of accreditation proof against the investor's chosen basis.
 * Advisory only: results are stored append-only for reviewers and never change
 * accreditation status. Investors never see them. Tax IDs are never requested.
 */
import { criteriaFor, deriveVerdict, type Criterion, type Verdict } from "@/lib/accreditation-ai-model";

const MODEL = "openai/gpt-6-astra";

async function db() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
}

/** Streams the Responses call and returns the final text. */
async function callAi(content: any[], criteria: string[]) {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI isn't configured.");
  const schema = {
    type: "object", additionalProperties: false, required: ["document_kind", "verdict", "criteria", "red_flags", "summary", "name_on_document"],
    properties: {
      document_kind: { type: "string" },
      name_on_document: { type: ["string", "null"] },
      verdict: { type: "string", enum: ["looks_complete", "needs_review", "mismatch"] },
      criteria: { type: "array", items: { type: "object", additionalProperties: false, required: ["label", "status", "note"], properties: { label: { type: "string" }, status: { type: "string", enum: ["met", "not_met", "unclear"] }, note: { type: "string" } } } },
      red_flags: { type: "array", items: { type: "string" } },
      summary: { type: "string" },
    },
  };
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({
      model: MODEL, reasoning: { effort: "low" }, store: false, stream: true,
      instructions: "You pre-screen accredited-investor evidence for a US fund administrator (Reg D 506(c)). Check the document only against the listed criteria, one result per criterion in the same order and wording. Mark 'met' only when clearly shown; 'unclear' when not visible or illegible. List warning signs: name mismatch with the investor, old or missing dates, missing pages or signature, signs of editing, illegible content, wrong document type for the basis. Never output tax ID, account or Social Security numbers. You never approve; a person decides.",
      input: [{ role: "user", content }],
      text: { format: { type: "json_schema", name: "accreditation_check", strict: true, schema } },
    }),
  });
  if (!res.ok || !res.body) {
    const t = await res.text().catch(() => "");
    console.error(`accreditation AI failed [${res.status}]: ${t.slice(0, 500)}`);
    throw new Error(res.status === 402 ? "AI credits have run out." : res.status === 429 ? "AI is busy." : `AI request failed [${res.status}].`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", text = "", done = "";
  for (;;) {
    const { value, done: end } = await reader.read();
    if (end) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const ev = JSON.parse(data);
        if (ev.type === "response.output_text.delta") text += ev.delta ?? "";
        else if (ev.type === "response.output_text.done") done = ev.text ?? "";
        else if (ev.type === "response.failed" || ev.type === "error") throw new Error("AI request failed.");
      } catch (e) { if ((e as Error).message === "AI request failed.") throw e; }
    }
  }
  const out = JSON.parse(done || text);
  void criteria;
  return out;
}

/** Runs one check and stores it. Never throws to callers that use it best-effort. */
export async function checkDocument(documentId: string, requestedBy: string | null): Promise<Verdict> {
  const d = await db();
  const { data: doc } = await d.from("accreditation_documents").select("id, application_id, storage_path, file_name, doc_kind").eq("id", documentId).maybeSingle();
  if (!doc) throw new Error("Document not found.");
  const [{ data: rec }, { data: app }] = await Promise.all([
    d.from("accreditation_records").select("method").eq("application_id", doc.application_id).maybeSingle(),
    d.from("investor_applications").select("user_id").eq("id", doc.application_id).maybeSingle(),
  ]);
  const method = doc.doc_kind === "verification_letter" ? "third_party_letter" : (rec?.method ?? null);
  const { data: prof } = await d.from("profiles").select("legal_name").eq("user_id", app?.user_id).maybeSingle();
  const criteria = criteriaFor(method);
  const save = (row: Record<string, unknown>) => d.from("accreditation_ai_checks").insert({ document_id: doc.id, application_id: doc.application_id, method, model: MODEL, requested_by: requestedBy, ...row });
  try {
    const { data: blob, error } = await d.storage.from("accreditation-docs").download(doc.storage_path);
    if (error || !blob) throw new Error("File unavailable.");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const b64 = btoa(bin);
    const lower = String(doc.file_name).toLowerCase();
    const mime = blob.type && blob.type !== "application/octet-stream" ? blob.type : lower.endsWith(".pdf") ? "application/pdf" : lower.endsWith(".png") ? "image/png" : "image/jpeg";
    const part = mime === "application/pdf"
      ? { type: "input_file", filename: "evidence.pdf", file_data: `data:application/pdf;base64,${b64}` }
      : { type: "input_image", image_url: `data:${mime};base64,${b64}` };
    const out = await callAi([part, { type: "input_text", text: `Investor name: ${prof?.legal_name ?? "unknown"}\nToday: ${new Date().toISOString().slice(0, 10)}\nBasis chosen: ${method ?? "not stated"}\nCriteria:\n${criteria.map((c, i) => `${i + 1}. ${c}`).join("\n")}` }], criteria);
    const crit: Criterion[] = (out.criteria ?? []).slice(0, 10).map((c: any) => ({ label: String(c.label).slice(0, 200), status: ["met", "not_met", "unclear"].includes(c.status) ? c.status : "unclear", note: String(c.note ?? "").replace(/\b\d{3}-?\d{2}-?\d{4}\b/g, "[redacted]").slice(0, 300) }));
    const flags = ((out.red_flags ?? []) as any[]).map((f) => String(f).slice(0, 300)).slice(0, 10);
    const verdict = deriveVerdict(String(out.verdict), crit, flags);
    await save({ verdict, document_kind: String(out.document_kind ?? "").slice(0, 120), criteria: crit, red_flags: flags, summary: String(out.summary ?? "").replace(/\b\d{3}-?\d{2}-?\d{4}\b/g, "[redacted]").slice(0, 1000) });
    return verdict;
  } catch (e) {
    console.error("[accreditation-ai]", (e as Error).message);
    await save({ verdict: "unavailable", summary: (e as Error).message.slice(0, 200) });
    return "unavailable";
  }
}

/** Best-effort: check every document on an application that has no check yet. */
export async function checkPendingDocuments(applicationId: string) {
  const d = await db();
  const { data: docs } = await d.from("accreditation_documents").select("id").eq("application_id", applicationId);
  const { data: done } = await d.from("accreditation_ai_checks").select("document_id").eq("application_id", applicationId).neq("verdict", "unavailable");
  const seen = new Set(((done ?? []) as any[]).map((r) => r.document_id));
  for (const doc of (docs ?? []) as any[]) if (!seen.has(doc.id)) await checkDocument(doc.id, null);
}

/** Latest check per document for reviewers. */
export async function latestChecks(applicationIds: string[]) {
  if (!applicationIds.length) return [] as any[];
  const d = await db();
  const { data } = await d.from("accreditation_ai_checks").select("document_id, application_id, verdict, document_kind, criteria, red_flags, summary, created_at").in("application_id", applicationIds).order("created_at", { ascending: false });
  const seen = new Set<string>();
  return ((data ?? []) as any[]).filter((r) => (seen.has(r.document_id) ? false : (seen.add(r.document_id), true)));
}
