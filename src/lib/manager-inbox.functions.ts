import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Manager inbox: every document an investor uploads lands here automatically,
 * scoped by RLS to the funds the signed-in reviewer may see.
 */

async function assertReviewer(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "fund_manager"]);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Forbidden: reviewer access required.");
}

export type InboxItem = {
  id: string;
  file_name: string;
  doc_kind: string;
  note: string | null;
  uploaded_at: string;
  offering_id: string;
  application_id: string;
  user_id: string;
  review_status: "new" | "accepted" | "needs_followup";
  review_note: string | null;
  reviewed_at: string | null;
  box_file_id: string | null;
  box_uploaded_at: string | null;
  box_error: string | null;
  fund_name: string | null;
  investor_name: string | null;
  investor_email: string | null;
};

export const listInboxUploads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertReviewer(supabase, userId);

    const { data, error } = await supabase
      .from("investor_documents")
      .select(
        "id, file_name, doc_kind, note, uploaded_at, offering_id, application_id, user_id, review_status, review_note, reviewed_at, box_file_id, box_uploaded_at, box_error",
      )
      .order("uploaded_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as any[];
    const offeringIds = [...new Set(rows.map((r) => r.offering_id as string))];
    const userIds = [...new Set(rows.map((r) => r.user_id as string))];

    const { data: funds } = offeringIds.length
      ? await supabase.from("offerings").select("id, name").in("id", offeringIds)
      : { data: [] as any[] };
    const { data: profiles } = userIds.length
      ? await supabase.from("profiles").select("user_id, legal_name, email").in("user_id", userIds)
      : { data: [] as any[] };

    const fundMap = new Map((funds ?? []).map((f: any) => [f.id, f.name as string]));
    const profileMap = new Map((profiles ?? []).map((p: any) => [p.user_id, p]));

    const items: InboxItem[] = rows.map((r) => ({
      ...(r as any),
      fund_name: fundMap.get(r.offering_id) ?? null,
      investor_name: profileMap.get(r.user_id)?.legal_name ?? null,
      investor_email: profileMap.get(r.user_id)?.email ?? null,
    }));

    return {
      items,
      counts: {
        total: items.length,
        newItems: items.filter((i) => i.review_status === "new").length,
        followUp: items.filter((i) => i.review_status === "needs_followup").length,
        accepted: items.filter((i) => i.review_status === "accepted").length,
        unfiled: items.filter((i) => !i.box_file_id).length,
      },
      funds: (funds ?? []).map((f: any) => ({ id: f.id as string, name: f.name as string })),
    };
  });

export const getInboxUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertReviewer(supabase, userId);
    // RLS decides whether this reviewer may see the row at all.
    const { data: row } = await supabase
      .from("investor_documents")
      .select("storage_path")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("That file is not available.");

    const { data: signed, error } = await supabase.storage
      .from("investor-uploads")
      .createSignedUrl(row.storage_path as string, 300);
    if (error || !signed) throw new Error(error?.message ?? "Could not open that file.");
    return { url: signed.signedUrl };
  });

const reviewSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["new", "accepted", "needs_followup"]),
  note: z.string().trim().max(1000).optional().nullable(),
});

export const setUploadReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => reviewSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertReviewer(supabase, userId);

    const { data: row } = await supabase
      .from("investor_documents")
      .select("id, offering_id, application_id, file_name, doc_kind")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("That file is not available.");

    const { error } = await supabase
      .from("investor_documents")
      .update({
        review_status: data.status,
        review_note: data.note?.trim() ? data.note.trim() : null,
        reviewed_by: data.status === "new" ? null : userId,
        reviewed_at: data.status === "new" ? null : new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await (
      await import("@/lib/reviewer-activity.server")
    ).logReviewerActivity(supabase, {
      actorId: userId,
      applicationId: (row.application_id as string) ?? null,
      offeringId: (row.offering_id as string) ?? null,
      action: "upload_reviewed",
      area: (row.doc_kind as string) ?? "documents",
      outcome:
        data.status === "accepted"
          ? "approved"
          : data.status === "needs_followup"
            ? "delayed"
            : "reopened",
      summary: `Investor upload "${row.file_name}" marked ${data.status.replace("_", " ")}`,
      note: data.note ?? null,
    });

    return { ok: true };
  });
