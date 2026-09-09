// NDA signing for diligence rooms, end to end:
// a manager uploads the NDA, the investor signs it in Box, the certified copy
// comes back into the room and the managers get an email.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const offeringInput = (data: unknown) => z.object({ offering_id: z.string().uuid() }).parse(data);

async function canManage(supabase: any, offeringId: string) {
  const { data } = await supabase.rpc("can_manage_diligence", { _offering_id: offeringId });
  return Boolean(data);
}

/** Manager uploads (or replaces) the NDA that investors must sign. */
export const uploadNdaDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        offering_id: z.string().uuid(),
        file_name: z.string().min(1).max(255),
        content_base64: z.string().min(1).max(28_000_000),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await canManage(supabase, data.offering_id))) {
      throw new Error("You do not have permission to manage this diligence room.");
    }

    const { data: room } = await supabase
      .from("diligence_rooms")
      .select("id, box_folder_id, nda_version")
      .eq("offering_id", data.offering_id)
      .maybeSingle();
    if (!room) throw new Error("Create the diligence room first.");

    const binary = Buffer.from(data.content_base64, "base64");
    if (binary.length === 0) throw new Error("That file appears to be empty.");
    if (binary.length > 20 * 1024 * 1024) throw new Error("Files must be 20 MB or smaller.");
    if (!data.file_name.toLowerCase().endsWith(".pdf")) {
      throw new Error("Please upload the agreement as a PDF so it can be signed.");
    }

    const { uploadFileTo, isBoxConfigured } = await import("@/lib/box.server");
    if (!isBoxConfigured()) throw new Error("Box is not connected yet.");

    const safeName = data.file_name.replace(/[\\/:*?"<>|]/g, "_");
    const uploaded = await uploadFileTo(
      room.box_folder_id,
      safeName,
      new Uint8Array(binary),
      "application/pdf",
    );

    const { error } = await supabase
      .from("diligence_rooms")
      .update({
        nda_box_file_id: uploaded.id,
        nda_file_name: safeName,
        nda_signing_enabled: true,
        nda_required: true,
      })
      .eq("id", room.id);
    if (error) throw new Error(error.message);

    const { data: profile } = await supabase
      .from("profiles")
      .select("legal_name, email")
      .eq("user_id", userId)
      .maybeSingle();

    await supabase.from("diligence_activity").insert({
      room_id: room.id,
      offering_id: data.offering_id,
      actor_id: userId,
      actor_name: profile?.legal_name ?? null,
      actor_email: profile?.email ?? null,
      event_type: "nda_updated",
      summary: `Uploaded “${safeName}” as the agreement investors must sign`,
      metadata: { box_file_id: uploaded.id, file_name: safeName },
    });

    return { ok: true, file_name: safeName };
  });

/** Turns Box signing on or off for the room's NDA. */
export const setNdaSigningEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ offering_id: z.string().uuid(), enabled: z.boolean() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (!(await canManage(supabase, data.offering_id))) {
      throw new Error("You do not have permission to manage this diligence room.");
    }
    const { error } = await supabase
      .from("diligence_rooms")
      .update({ nda_signing_enabled: data.enabled })
      .eq("offering_id", data.offering_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** What the signed-in person needs to know about signing this room's NDA. */
export const getMyNdaSigning = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(offeringInput)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: room } = await supabase
      .from("diligence_rooms")
      .select("id, nda_version, nda_required, nda_signing_enabled, nda_file_name, nda_box_file_id")
      .eq("offering_id", data.offering_id)
      .maybeSingle();
    if (!room) return { available: false } as const;

    const { data: signature } = await supabase
      .from("diligence_nda_signatures")
      .select("id, status, signing_url, sent_at, viewed_at, completed_at, signed_pdf_path")
      .eq("room_id", room.id)
      .eq("user_id", userId)
      .eq("nda_version", room.nda_version)
      .maybeSingle();

    return {
      available: Boolean(room.nda_signing_enabled && room.nda_box_file_id),
      fileName: (room.nda_file_name as string | null) ?? null,
      ndaVersion: room.nda_version as number,
      signature: signature
        ? {
            id: signature.id as string,
            status: signature.status as string,
            signingUrl: (signature.signing_url as string | null) ?? null,
            sentAt: (signature.sent_at as string | null) ?? null,
            viewedAt: (signature.viewed_at as string | null) ?? null,
            completedAt: (signature.completed_at as string | null) ?? null,
            hasSignedCopy: Boolean(signature.signed_pdf_path),
          }
        : null,
    } as const;
  });

/** Sends the room's NDA out for signature to the signed-in investor. */
export const startNdaSigning = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(offeringInput)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: room } = await supabase
      .from("diligence_rooms")
      .select("id, nda_version, nda_signing_enabled, nda_box_file_id, nda_file_name")
      .eq("offering_id", data.offering_id)
      .maybeSingle();
    if (!room) throw new Error("That diligence room is not available.");
    if (!room.nda_signing_enabled || !room.nda_box_file_id) {
      throw new Error("The agreement has not been uploaded for signing yet.");
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("legal_name, email")
      .eq("user_id", userId)
      .maybeSingle();
    const email = profile?.email;
    if (!email) throw new Error("Add your email to your profile before signing.");
    const signerName = profile?.legal_name ?? email;

    const { data: offering } = await supabase
      .from("offerings")
      .select("name")
      .eq("id", data.offering_id)
      .maybeSingle();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createSignRequest, getSignRequest } = await import("@/lib/box.server");

    const { data: existing } = await supabaseAdmin
      .from("diligence_nda_signatures")
      .select("id, sign_request_id, status")
      .eq("room_id", room.id)
      .eq("user_id", userId)
      .eq("nda_version", room.nda_version)
      .maybeSingle();

    if (existing?.status === "completed") return { url: null, completed: true, reused: true };

    // Reuse a live request instead of sending a duplicate.
    if (existing?.sign_request_id && existing.status === "out_for_signature") {
      const live = await getSignRequest(existing.sign_request_id).catch(() => null);
      if (live?.signingUrl) {
        await supabaseAdmin
          .from("diligence_nda_signatures")
          .update({ signing_url: live.signingUrl })
          .eq("id", existing.id);
        return { url: live.signingUrl, completed: false, reused: true };
      }
    }

    const fundName = offering?.name ?? "Harmonious";
    const request = await createSignRequest({
      fileId: room.nda_box_file_id,
      signerEmail: email,
      signerName,
      documentName: `${fundName} — Confidentiality agreement`,
      message: `Please review and sign the confidentiality agreement for ${fundName}. The diligence materials open as soon as it is signed.`,
      externalId: `nda:${room.id}:${userId}`,
      redirectUrl: `https://onboard.harmonious.co/diligence/${data.offering_id}`,
    });

    const now = new Date().toISOString();
    const row = {
      room_id: room.id,
      offering_id: data.offering_id,
      user_id: userId,
      nda_version: room.nda_version,
      signer_name: signerName,
      signer_email: email,
      source_box_file_id: room.nda_box_file_id,
      sign_request_id: request.id,
      status: "out_for_signature",
      signing_url: request.signingUrl,
      sent_at: now,
      viewed_at: null,
      completed_at: null,
      signed_box_file_id: null,
      signed_pdf_path: null,
      manager_notified_at: null,
    };

    if (existing?.id) {
      const { error } = await supabaseAdmin
        .from("diligence_nda_signatures")
        .update(row)
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("diligence_nda_signatures").insert(row);
      if (error) throw new Error(error.message);
    }

    await supabaseAdmin.from("diligence_activity").insert({
      room_id: room.id,
      offering_id: data.offering_id,
      actor_id: userId,
      actor_name: signerName,
      actor_email: email,
      event_type: "nda_sent",
      summary: `${signerName} opened the confidentiality agreement for signature`,
      metadata: { sign_request_id: request.id, nda_version: room.nda_version },
    });

    return { url: request.signingUrl, completed: false, reused: false };
  });

/** Pulls the latest Box state for the caller's own in-flight NDA request. */
export const refreshMyNdaSignature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(offeringInput)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: signature } = await supabase
      .from("diligence_nda_signatures")
      .select("sign_request_id, status")
      .eq("offering_id", data.offering_id)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!signature?.sign_request_id) return { status: "none", completed: false };

    const { syncNdaSignRequest } = await import("@/lib/nda-sign-complete.server");
    const result = await syncNdaSignRequest(signature.sign_request_id);
    return { status: result.status, completed: result.completed };
  });

/** A short-lived link to the certified signed copy. */
export const getSignedNdaUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // RLS returns the row only to the signer, an admin or an assigned manager.
    const { data: row } = await supabase
      .from("diligence_nda_signatures")
      .select("id, signed_pdf_path, signer_name")
      .eq("id", data.id)
      .maybeSingle();
    if (!row?.signed_pdf_path) throw new Error("There is no signed copy yet.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("signed-documents")
      .createSignedUrl(row.signed_pdf_path, 300);
    if (error || !signed?.signedUrl) throw new Error(error?.message ?? "Could not open the file.");
    return { url: signed.signedUrl, file_name: `NDA — ${row.signer_name}.pdf` };
  });

/** Manager view: who has been sent the NDA, who opened it, who signed. */
export const listNdaSignatures = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(offeringInput)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (!(await canManage(supabase, data.offering_id))) {
      throw new Error("You do not have permission to view this fund's agreements.");
    }
    const { data: rows, error } = await supabase
      .from("diligence_nda_signatures")
      .select(
        "id, signer_name, signer_email, status, sent_at, viewed_at, completed_at, signed_pdf_path, manager_notified_at",
      )
      .eq("offering_id", data.offering_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return {
      signatures: (rows ?? []).map((r: any) => ({
        id: r.id as string,
        signerName: (r.signer_name as string) ?? "Investor",
        signerEmail: (r.signer_email as string) ?? "",
        status: r.status as string,
        sentAt: (r.sent_at as string | null) ?? null,
        viewedAt: (r.viewed_at as string | null) ?? null,
        completedAt: (r.completed_at as string | null) ?? null,
        hasSignedCopy: Boolean(r.signed_pdf_path),
        managerNotifiedAt: (r.manager_notified_at as string | null) ?? null,
      })),
    };
  });
