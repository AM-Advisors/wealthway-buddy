/**
 * Records when someone opens or downloads one of a fund's legal documents
 * (the PPM, LPA, subscription agreement and friends). Stored in the same
 * activity trail as diligence-room reads so managers see one picture.
 */
export const LEGAL_VIEW_EVENTS = ["legal_document_viewed", "legal_document_downloaded"] as const;

export async function logLegalDocumentView(
  supabase: any,
  userId: string,
  doc: { id: string; offering_id: string; title?: string | null; file_name?: string | null },
  action: "viewed" | "downloaded",
) {
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("legal_name, email")
      .eq("user_id", userId)
      .maybeSingle();

    const title = doc.title ?? doc.file_name ?? "A legal document";
    await supabase.from("diligence_activity").insert({
      room_id: null,
      offering_id: doc.offering_id,
      actor_id: userId,
      actor_name: (profile as any)?.legal_name ?? null,
      actor_email: (profile as any)?.email ?? null,
      event_type: action === "downloaded" ? "legal_document_downloaded" : "legal_document_viewed",
      summary: `${action === "downloaded" ? "Downloaded" : "Opened"} ${title}`,
      metadata: {
        offering_document_id: doc.id,
        document_title: title,
        file_name: doc.file_name ?? null,
      },
    });
  } catch {
    // Never block a document from opening because the log failed.
  }
}
