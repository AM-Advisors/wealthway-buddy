import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "./require-auth";

export const draftDocumentQuestionsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ offeringId: z.string().uuid(), versionIds: z.array(z.string().uuid()).min(1).max(3) }).parse)
  .handler(async ({ data, context }) => {
    const ai = await import("./fund-question-ai.server");
    await ai.questionAuthorAccess(context.supabase, context.userId, data.offeringId);
    const { db } = await import("./fund-tabs.server");
    const client = await db();
    const { data: sections, error } = await client.from("fund_questionnaire_sections").select("questions").eq("offering_id", data.offeringId).in("status", ["draft", "approved"]).order("version", { ascending: false }).limit(1);
    if (error) throw new Error("Could not load current fund questions.");
    const abort = new AbortController();
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("\n"));
        const heartbeat = setInterval(() => controller.enqueue(encoder.encode("\n")), 10000);
        void ai.generateDocumentQuestions(client, { ...data, existing: sections?.[0]?.questions ?? [] }, abort.signal)
          .then((result) => controller.enqueue(encoder.encode(JSON.stringify({ result }) + "\n")))
          .catch((error) => { if (!abort.signal.aborted) controller.enqueue(encoder.encode(JSON.stringify({ error: error instanceof Error ? error.message : "AI could not read the agreement." }) + "\n")); })
          .finally(() => { clearInterval(heartbeat); if (!abort.signal.aborted) controller.close(); });
      },
      cancel() { abort.abort(); },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
  });

export const resetQuestionAiFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ offeringId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    const { questionAuthorAccess } = await import("./fund-question-ai.server");
    const access = await questionAuthorAccess(context.supabase, context.userId, data.offeringId);
    if (!access.staff) throw new Error("Harmonious must confirm AI access has been restored.");
    const { db } = await import("./fund-tabs.server");
    const { error } = await (await db()).from("fund_questionnaire_ai_state").update({ reset_at: new Date().toISOString(), reset_by: context.userId }).eq("offering_id", data.offeringId);
    if (error) throw new Error("Could not restore document reading.");
    return { ok: true };
  });