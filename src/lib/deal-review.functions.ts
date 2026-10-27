import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/require-auth";
import { documentsUnlocked, preCommitmentDocs, publishedTerms } from "@/lib/deal-review-model";
import { DEFAULT_NDA, ndaHash } from "@/lib/diligence.functions";
import { fundAcceptsInvestments, prospectDocumentsVisible } from "@/lib/fund-status-model";

const slugInput = z.object({ slug: z.string().min(1).max(200) });

/** Resolve a launched fund (throws otherwise) plus its deal room. Admin reads only after the caller is signed in. */
async function context(slug: string) {
  const { launchedOffering } = await import("@/lib/investor-onboarding.server");
  const { offering } = await launchedOffering(slug);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const { data: room } = await db
    .from("diligence_rooms")
    .select("id, intro, nda_required, nda_text, nda_version")
    .eq("offering_id", offering.id)
    .maybeSingle();
  return { db, offering: offering as any, room: room as any };
}

async function ndaAccepted(db: any, room: any, userId: string) {
  if (!room) return false;
  const { data } = await db
    .from("diligence_nda_acceptances")
    .select("id")
    .eq("room_id", room.id)
    .eq("user_id", userId)
    .eq("nda_version", room.nda_version)
    .maybeSingle();
  return Boolean(data);
}

async function log(db: any, userId: string, offeringId: string, roomId: string | null, type: string, summary: string, metadata: Record<string, unknown> = {}) {
  const { data: who } = await db.from("profiles").select("legal_name, email").eq("user_id", userId).maybeSingle();
  await db.from("diligence_activity").insert({
    room_id: roomId, offering_id: offeringId, actor_id: userId,
    actor_name: who?.legal_name ?? null, actor_email: who?.email ?? null,
    event_type: type, summary, metadata,
  });
}

export const getDealReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(slugInput.parse)
  .handler(async ({ data, context: ctx }) => {
    const { db, offering, room } = await context(data.slug);
    const [{ data: statement }, { data: assets }] = await Promise.all([
      db.from("offering_statements").select("*").eq("offering_id", offering.id).maybeSingle(),
      db.from("portfolio_assets").select("id, issuer_name, asset_name, asset_class, instrument, status").eq("offering_id", offering.id).limit(20),
    ]);
    const ndaRequired = Boolean(room?.nda_required);
    const accepted = await ndaAccepted(db, room, ctx.userId);
    const unlocked = documentsUnlocked(ndaRequired, accepted);
    let documents: any[] = [];
    if (room && unlocked && prospectDocumentsVisible(offering)) {
      const { data: docs } = await db
        .from("diligence_documents")
        .select("id, category, title, description, file_name, size_bytes, uploaded_at, show_pre_commitment, archived_at, visibility")
        .eq("room_id", room.id)
        .order("uploaded_at", { ascending: false });
      documents = preCommitmentDocs(docs ?? []).map(({ show_pre_commitment, archived_at, visibility, ...d }: any) => d);
    }
    if (room) await log(db, ctx.userId, offering.id, room.id, "deal_review_visit", "Opened the deal review");
    return {
      offeringId: offering.id as string,
      isOpen: fundAcceptsInvestments(offering),
      closed: offering.lifecycle_status === "closed",
      intro: (room?.intro ?? null) as string | null,
      statement: publishedTerms(statement as any),
      assets: (assets ?? []) as any[],
      hasRoom: Boolean(room),
      ndaRequired,
      ndaAccepted: accepted,
      ndaText: ndaRequired ? ((room?.nda_text ?? DEFAULT_NDA) as string) : null,
      documents,
    };
  });

export const acceptDealReviewNda = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(slugInput.extend({ signer_name: z.string().trim().min(2).max(160) }).parse)
  .handler(async ({ data, context: ctx }) => {
    const { db, offering, room } = await context(data.slug);
    if (!room?.nda_required) return { ok: true };
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const { error } = await db.from("diligence_nda_acceptances").insert({
      room_id: room.id, offering_id: offering.id, user_id: ctx.userId, nda_version: room.nda_version,
      signer_name: data.signer_name, nda_hash: ndaHash(room.nda_text ?? DEFAULT_NDA, room.nda_version),
      ip_address: getRequestHeader("cf-connecting-ip") ?? getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      user_agent: getRequestHeader("user-agent") ?? null,
    });
    if (error && !error.message.includes("duplicate")) throw new Error("Could not record your acceptance. Please try again.");
    await log(db, ctx.userId, offering.id, room.id, "nda_accepted", `${data.signer_name} accepted the confidentiality agreement (deal review)`, { nda_version: room.nda_version });
    return { ok: true };
  });

export const openDealReviewDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(slugInput.extend({ id: z.string().uuid() }).parse)
  .handler(async ({ data, context: ctx }) => {
    const { db, offering, room } = await context(data.slug);
    if (!room || !prospectDocumentsVisible(offering)) throw new Error("That document is not available.");
    if (!documentsUnlocked(Boolean(room.nda_required), await ndaAccepted(db, room, ctx.userId))) {
      throw new Error("Please accept the confidentiality agreement first.");
    }
    const { data: doc } = await db
      .from("diligence_documents")
      .select("id, title, file_name, box_file_id, show_pre_commitment, archived_at, visibility")
      .eq("id", data.id).eq("room_id", room.id).maybeSingle();
    if (!doc || preCommitmentDocs([doc]).length === 0) throw new Error("That document is not available.");
    const { temporaryDownloadUrl } = await import("@/lib/box.server");
    const url = await temporaryDownloadUrl(doc.box_file_id);
    await log(db, ctx.userId, offering.id, room.id, "document_viewed", `Read “${doc.title}” in the deal review`, { document_id: doc.id, document_title: doc.title });
    return { url, file_name: doc.file_name as string };
  });

/** Manager toggle: show a deal room document before commitment. */
export const setPreCommitmentVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ id: z.string().uuid(), show: z.boolean() }).parse)
  .handler(async ({ data, context: ctx }) => {
    const { data: doc } = await ctx.supabase.from("diligence_documents").select("id, offering_id").eq("id", data.id).maybeSingle();
    if (!doc) throw new Error("That document is not available.");
    const { data: can } = await ctx.supabase.rpc("can_manage_diligence", { _offering_id: doc.offering_id });
    if (!can) throw new Error("Only the fund's managers can change this.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any).from("diligence_documents").update({ show_pre_commitment: data.show }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
