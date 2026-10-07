import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuthUnverified } from "@/lib/require-auth";

const KIND_LABEL = { access: "Download my data", deletion: "Delete my data", correction: "Correct my data" } as const;

/** GDPR data-subject request: recorded, then routed to Operations as a 30-day task. Never deletes anything itself. */
export const submitPrivacyRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuthUnverified])
  .inputValidator((d) => z.object({ kind: z.enum(["access", "deletion", "correction"]), details: z.string().max(2000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = String((context.claims as { email?: string }).email ?? "");
    const { data: row, error } = await supabaseAdmin
      .from("privacy_requests")
      .insert({ user_id: context.userId, email, kind: data.kind, details: data.details })
      .select("id, due_at")
      .single();
    if (error) throw new Error("Could not record your request.");
    await supabaseAdmin.from("staff_tasks").insert({
      title: `Privacy request: ${KIND_LABEL[data.kind]} (${email})`,
      description: `Data-subject request ${row.id}. Respond by ${row.due_at.slice(0, 10)}. Keep records under legal or tax hold and tell the person why.\n\n${data.details}`,
      priority: "high",
      team: "operations",
      responsibility_status: "HARMONIOUS_HANDLING",
      related_workflow_type: "privacy_request",
      related_workflow_id: row.id,
      source: "workflow",
      due_date: row.due_at.slice(0, 10),
    });
    return { ok: true };
  });

export const myPrivacyRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuthUnverified])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("privacy_requests").select("id, kind, status, due_at, created_at").order("created_at", { ascending: false });
    return (data ?? []) as { id: string; kind: string; status: string; due_at: string; created_at: string }[];
  });
