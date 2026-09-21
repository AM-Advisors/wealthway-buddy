// Server-only: finalises a Box Sign request for a diligence-room NDA.
// Downloads the certified signed PDF, keeps a copy in private storage, opens
// the room for the signer, records the acceptance and alerts the managers once.

import { downloadFile, getSignRequest, mapSignStatus } from "@/lib/box.server";

async function sha256Hex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface NdaSyncResult {
  status: string;
  completed: boolean;
  signatureId: string | null;
}

/** Pulls the latest Box Sign state for one NDA request and finalises it. */
export async function syncNdaSignRequest(
  signRequestId: string,
  opts: { status?: string; completedAt?: string } = {},
): Promise<NdaSyncResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: row } = await supabaseAdmin
    .from("diligence_nda_signatures")
    .select(
      "id, room_id, offering_id, user_id, nda_version, signer_name, signer_email, status, viewed_at, completed_at, manager_notified_at",
    )
    .eq("sign_request_id", signRequestId)
    .maybeSingle();

  if (!row) return { status: "unknown_sign_request", completed: false, signatureId: null };

  const remote = await getSignRequest(signRequestId).catch(() => null);
  const rawStatus = remote?.status ?? opts.status ?? "unknown";
  const mapped = mapSignStatus(rawStatus);
  const now = new Date().toISOString();

  const patch: Record<string, unknown> = { status: mapped };

  const openedNow =
    remote?.viewed || String(opts.status ?? "").toLowerCase().includes("view") || mapped === "completed";
  if (!row.viewed_at && openedNow) {
    patch["viewed_at"] = remote?.viewedAt ?? opts.completedAt ?? now;
  }

  if (mapped === "completed" && remote?.signedFileId) {
    const completedAt = opts.completedAt ?? now;
    const pdfBytes = await downloadFile(remote.signedFileId);
    const hash = await sha256Hex(pdfBytes);
    const path = `nda/${row.offering_id}/${row.user_id}-v${row.nda_version}.pdf`;

    const upload = await supabaseAdmin.storage
      .from("signed-documents")
      .upload(path, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (upload.error) throw new Error(upload.error.message);

    patch["completed_at"] = completedAt;
    patch["signed_box_file_id"] = remote.signedFileId;
    patch["signed_pdf_path"] = path;
    patch["document_hash"] = hash;
  }

  const { error: updateError } = await supabaseAdmin
    .from("diligence_nda_signatures")
    .update(patch as never)
    .eq("id", row.id);
  if (updateError) throw new Error(updateError.message);

  if (mapped === "completed" && !row.completed_at) {
    await openTheRoom(row);
    await notifyManagers(row);
  }

  return { status: mapped, completed: mapped === "completed", signatureId: row.id };
}

type NdaRow = {
  id: string;
  room_id: string;
  offering_id: string;
  user_id: string;
  nda_version: number;
  signer_name: string;
  signer_email: string;
};

/** Records the acceptance so the gate lifts, and logs it on the activity trail. */
async function openTheRoom(row: NdaRow) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: room } = await supabaseAdmin
    .from("diligence_rooms")
    .select("nda_text, nda_version")
    .eq("id", row.room_id)
    .maybeSingle();

  const source = `${room?.nda_text ?? "signed-nda"}::v${row.nda_version}`;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(source) as unknown as BufferSource,
  );
  const hash = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  await supabaseAdmin.from("diligence_nda_acceptances").insert({
    room_id: row.room_id,
    offering_id: row.offering_id,
    user_id: row.user_id,
    nda_version: row.nda_version,
    signer_name: row.signer_name,
    nda_hash: hash,
    ip_address: null,
    user_agent: "box_sign",
  });

  await supabaseAdmin.from("diligence_activity").insert({
    room_id: row.room_id,
    offering_id: row.offering_id,
    actor_id: row.user_id,
    actor_name: row.signer_name,
    actor_email: row.signer_email,
    event_type: "nda_accepted",
    summary: `${row.signer_name} signed the confidentiality agreement in Box`,
    metadata: { nda_version: row.nda_version, provider: "box_sign", signature_id: row.id },
  });
}

/** Emails the fund's assigned managers (or admins) that the NDA is signed. */
async function notifyManagers(row: NdaRow) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: offering }, { data: assignments }] = await Promise.all([
      supabaseAdmin.from("offerings").select("name").eq("id", row.offering_id).maybeSingle(),
      supabaseAdmin.from("fund_managers").select("user_id").eq("offering_id", row.offering_id),
    ]);

    const managerIds = (assignments ?? []).map((a: any) => a.user_id as string);
    const { data: managers } = managerIds.length
      ? await supabaseAdmin.from("profiles").select("legal_name, email").in("user_id", managerIds)
      : { data: [] as any[] };

    let recipients = (managers ?? []).filter((m: any) => m.email);
    if (recipients.length === 0) {
      const { data: adminRoles } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");
      const adminIds = (adminRoles ?? []).map((a: any) => a.user_id as string);
      const { data: admins } = adminIds.length
        ? await supabaseAdmin.from("profiles").select("legal_name, email").in("user_id", adminIds)
        : { data: [] as any[] };
      recipients = (admins ?? []).filter((a: any) => a.email);
    }
    if (recipients.length === 0) {
      recipients = [{ legal_name: "Harmonious operations", email: "operations@harmonious.co" }];
    }

    const signedAt = new Date().toISOString();
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");

    for (const manager of recipients) {
      if (!manager.email) continue;
      await sendTemplateEmail("document-signed", manager.email, {
        templateData: {
          managerName: manager.legal_name ?? "there",
          investorName: row.signer_name,
          offeringName: offering?.name ?? "your fund",
          documentTitle: "Confidentiality agreement (NDA)",
          signedAt,
          commitmentCents: 0,
          portalUrl: `https://app.harmonious.co/manager/diligence`,
        },
        idempotencyKey: `nda-signed-${row.id}-${manager.email}`,
      }).catch((e) => console.error("[nda-sign] manager email failed", e));
    }

    await supabaseAdmin
      .from("diligence_nda_signatures")
      .update({ manager_notified_at: signedAt })
      .eq("id", row.id);
  } catch (e) {
    console.error("[nda-sign] manager notification failed", e);
  }
}
