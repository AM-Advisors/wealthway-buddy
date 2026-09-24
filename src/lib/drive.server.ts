// Server-only: Google Drive filing for Harmonious funds and investors.
// Drive is a repository; Harmonious records remain authoritative.

import {
  DriveConflictError,
  FOLDER_MIME,
  FUND_SUBFOLDERS,
  INVESTOR_SUBFOLDERS,
  ensureSubfolders,
  ensureTaggedFolder,
  executedFileName,
  filingTargets,
  fundKey,
  investorFolderName,
  investorKey,
  isTaxForm,
  safeName,
  type DriveClient,
  type DriveFile,
} from "@/lib/drive-structure";

const GATEWAY = "https://connector-gateway.lovable.dev/google_drive";
const DEFAULT_ROOT = "1ObGXOWYDm0XGgf0YyTqA8YTc6A3aS0Ak";

export const driveRootId = () => process.env["GOOGLE_DRIVE_ROOT_FOLDER_ID"] || DEFAULT_ROOT;

const q = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

function headers(extra: Record<string, string> = {}) {
  const lovable = process.env["LOVABLE_API_KEY"];
  const conn = process.env["GOOGLE_DRIVE_API_KEY"];
  if (!lovable || !conn) throw new Error("Google Drive is not connected.");
  return { Authorization: `Bearer ${lovable}`, "X-Connection-Api-Key": conn, ...extra };
}

async function call(path: string, init: RequestInit = {}) {
  const res = await fetch(`${GATEWAY}${path}`, { ...init, headers: headers(init.headers as any) });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Drive request failed [${res.status}]: ${body.slice(0, 300)}`);
  }
  return res.json();
}

const COMMON = "supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives";

async function list(query: string): Promise<DriveFile[]> {
  const params = `q=${encodeURIComponent(query)}&fields=${encodeURIComponent("files(id,name,appProperties)")}&${COMMON}`;
  const data = await call(`/drive/v3/files?${params}`);
  return data.files ?? [];
}

export const gatewayDrive: DriveClient = {
  async findByKey(parentId, key) {
    const files = await list(
      `'${q(parentId)}' in parents and trashed=false and appProperties has { key='harmonious_key' and value='${q(key)}' }`,
    );
    return files[0] ?? null;
  },
  findByName(parentId, name) {
    return list(`'${q(parentId)}' in parents and trashed=false and name='${q(name)}'`);
  },
  async createFolder(parentId, name, key) {
    return call(`/drive/v3/files?supportsAllDrives=true&fields=id,name,appProperties`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId], appProperties: { harmonious_key: key } }),
    });
  },
  async renameFolder(folderId, name) {
    await call(`/drive/v3/files/${encodeURIComponent(folderId)}?supportsAllDrives=true`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
  },
  async uploadPdf(parentId, name, bytes, key) {
    const boundary = `hm${crypto.randomUUID()}`;
    const meta = JSON.stringify({ name, parents: [parentId], appProperties: { harmonious_key: key } });
    const enc = new TextEncoder();
    const head = enc.encode(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`,
    );
    const tail = enc.encode(`\r\n--${boundary}--`);
    const body = new Uint8Array(head.length + bytes.length + tail.length);
    body.set(head, 0);
    body.set(bytes, head.length);
    body.set(tail, head.length + bytes.length);
    const res = await fetch(`${GATEWAY}/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name`, {
      method: "POST",
      headers: headers({ "Content-Type": `multipart/related; boundary=${boundary}` }),
      body,
    });
    if (!res.ok) throw new Error(`Google Drive upload failed [${res.status}]: ${(await res.text()).slice(0, 300)}`);
    return res.json();
  },
};

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
}

type Actor = { userId?: string | null; actor?: string };

async function logEvent(offeringId: string | null, mappingId: string | null, event: string, detail: Record<string, unknown>, who: Actor) {
  const db = await admin();
  await db.from("drive_sync_events").insert({
    offering_id: offeringId,
    mapping_id: mappingId,
    event,
    detail,
    actor_user_id: who.userId ?? null,
    actor: who.actor ?? (who.userId ? "staff" : "system"),
  });
}

async function upsertMapping(row: Record<string, unknown>) {
  const db = await admin();
  const { data, error } = await db
    .from("drive_folder_mappings")
    .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: "harmonious_key" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function raiseTask(offeringId: string, message: string) {
  // Operations sees "Needs attention" on the fund record and in the Drive list.
  console.error(`[drive] ${offeringId}: ${message}`);
}

/** Create (or re-find) the fund folder and its subfolders. Idempotent. */
export async function ensureFundStructure(offeringId: string, who: Actor = {}, drive: DriveClient = gatewayDrive) {
  const db = await admin();
  const { data: offering } = await db.from("offerings").select("id,name,legal_entity_name").eq("id", offeringId).maybeSingle();
  if (!offering) throw new Error("Fund not found.");
  const key = fundKey(offeringId);
  const { data: existing } = await db.from("drive_folder_mappings").select("*").eq("harmonious_key", key).maybeSingle();
  if (existing?.status === "archived") return existing;
  const name = safeName(offering.name ?? offering.legal_entity_name ?? "Fund");
  try {
    let folderId: string = existing?.folder_id;
    if (!folderId) {
      const res = await ensureTaggedFolder(drive, driveRootId(), name, key);
      folderId = res.folder.id;
      if (res.created) await logEvent(offeringId, existing?.id ?? null, "folder_created", { folder_id: folderId, name }, who);
    } else if (existing.folder_name && existing.folder_name !== name) {
      await drive.renameFolder(folderId, name);
      await logEvent(offeringId, existing.id, "folder_renamed", { folder_id: folderId, from: existing.folder_name, to: name }, who);
    }
    const { subfolders, created } = await ensureSubfolders(drive, folderId, key, FUND_SUBFOLDERS, existing?.subfolders ?? {});
    const mapping = await upsertMapping({
      entity_kind: "fund", offering_id: offeringId, harmonious_key: key, folder_id: folderId, folder_name: name,
      subfolders, status: "active", last_error: null, last_synced_at: new Date().toISOString(),
    });
    for (const s of created) await logEvent(offeringId, mapping.id, "subfolder_created", { name: s, folder_id: subfolders[s] }, who);
    return mapping;
  } catch (e: any) {
    const conflict = e instanceof DriveConflictError;
    const mapping = await upsertMapping({
      entity_kind: "fund", offering_id: offeringId, harmonious_key: key, folder_name: name,
      status: conflict ? "conflict" : "needs_attention", last_error: String(e?.message ?? e).slice(0, 500),
    });
    await logEvent(offeringId, mapping.id, conflict ? "conflict" : "sync_failed", {
      error: String(e?.message ?? e).slice(0, 300), ...(conflict ? { existing_ids: e.existingIds } : {}),
    }, who);
    await raiseTask(offeringId, mapping.last_error);
    return mapping;
  }
}

/** Link an existing untagged fund folder explicitly (resolves a conflict). */
export async function linkExistingFundFolder(offeringId: string, folderId: string, who: Actor, drive: DriveClient = gatewayDrive) {
  const db = await admin();
  const { data: offering } = await db.from("offerings").select("name").eq("id", offeringId).maybeSingle();
  const key = fundKey(offeringId);
  const mapping = await upsertMapping({
    entity_kind: "fund", offering_id: offeringId, harmonious_key: key, folder_id: folderId,
    folder_name: safeName(offering?.name ?? "Fund"), status: "pending", last_error: null,
  });
  await logEvent(offeringId, mapping.id, "folder_linked", { folder_id: folderId }, who);
  return ensureFundStructure(offeringId, who, drive);
}

/** Investor folder for one Investment Profile within one fund. */
export async function ensureInvestorStructure(offeringId: string, profileId: string, who: Actor = {}, drive: DriveClient = gatewayDrive) {
  const db = await admin();
  const fund = await ensureFundStructure(offeringId, who, drive);
  if (fund.status !== "active") return null;
  const { data: profile } = await db.from("investment_profiles").select("id,profile_type,legal_name,display_label").eq("id", profileId).maybeSingle();
  if (!profile) throw new Error("Investment profile not found.");
  const key = investorKey(offeringId, profileId);
  const name = investorFolderName(profile.legal_name ?? profile.display_label ?? "Investor", profile.profile_type);
  const { data: existing } = await db.from("drive_folder_mappings").select("*").eq("harmonious_key", key).maybeSingle();
  if (existing?.status === "archived") return existing;
  try {
    let folderId: string = existing?.folder_id;
    if (!folderId) {
      const res = await ensureTaggedFolder(drive, fund.subfolders["Investors"], name, key);
      folderId = res.folder.id;
      if (res.created) await logEvent(offeringId, existing?.id ?? null, "folder_created", { folder_id: folderId, kind: "investor" }, who);
    } else if (existing.folder_name !== name) {
      await drive.renameFolder(folderId, name);
    }
    const { subfolders } = await ensureSubfolders(drive, folderId, key, INVESTOR_SUBFOLDERS, existing?.subfolders ?? {});
    return upsertMapping({
      entity_kind: "investor", offering_id: offeringId, investment_profile_id: profileId, harmonious_key: key,
      folder_id: folderId, folder_name: name, subfolders, status: "active", last_error: null,
      last_synced_at: new Date().toISOString(),
    });
  } catch (e: any) {
    const conflict = e instanceof DriveConflictError;
    const mapping = await upsertMapping({
      entity_kind: "investor", offering_id: offeringId, investment_profile_id: profileId, harmonious_key: key,
      folder_name: name, status: conflict ? "conflict" : "needs_attention", last_error: String(e?.message ?? e).slice(0, 500),
    });
    await logEvent(offeringId, mapping.id, conflict ? "conflict" : "sync_failed", { error: String(e?.message ?? e).slice(0, 300) }, who);
    return mapping;
  }
}

async function enabled(offeringId: string) {
  const db = await admin();
  const { data } = await db.from("offerings").select("drive_sync_enabled").eq("id", offeringId).maybeSingle();
  return Boolean(data?.drive_sync_enabled);
}

/** Hook: fund launched. Never throws — the launch itself stands. */
export async function onFundLaunched(offeringId: string, userId: string | null) {
  try {
    if (await enabled(offeringId)) await ensureFundStructure(offeringId, { userId, actor: "fund_launch" });
  } catch (e) {
    console.error("[drive] fund launch hook", e);
  }
}

/** Hook: investment accepted. Never throws. */
export async function onInvestmentAccepted(onboardingId: string, userId: string | null) {
  try {
    const db = await admin();
    const { data: row } = await db.from("investor_onboardings").select("offering_id,investment_profile_id").eq("id", onboardingId).maybeSingle();
    if (!row?.investment_profile_id || !(await enabled(row.offering_id))) return;
    await ensureInvestorStructure(row.offering_id, row.investment_profile_id, { userId, actor: "investment_accepted" });
  } catch (e) {
    console.error("[drive] acceptance hook", e);
  }
}

/**
 * Hook: Box reports the request complete (every required signer confirmed).
 * Files the executed PDF; replays are no-ops. Never throws.
 */
export async function fileExecutedSignature(signatureId: string, drive: DriveClient = gatewayDrive) {
  try {
    const db = await admin();
    const { data: sig } = await db
      .from("document_signatures")
      .select("id,application_id,offering_document_id,investment_profile_id,provider_status,pdf_path,provider_completed_at,cancelled_at,superseded_by,signed_file_version_id")
      .eq("id", signatureId)
      .maybeSingle();
    if (!sig || sig.provider_status !== "completed" || sig.cancelled_at || sig.superseded_by || !sig.pdf_path) return { filed: 0 };
    const { data: doc } = await db.from("offering_documents").select("offering_id,title,doc_type,current_version").eq("id", sig.offering_document_id).maybeSingle();
    if (!doc || isTaxForm(doc.title) || !(await enabled(doc.offering_id))) return { filed: 0 };
    let profileId = sig.investment_profile_id as string | null;
    if (!profileId) {
      const { data: ob } = await db.from("investor_onboardings").select("investment_profile_id").eq("application_id", sig.application_id).maybeSingle();
      profileId = ob?.investment_profile_id ?? null;
    }
    if (!profileId) return { filed: 0 };
    const mapping = await ensureInvestorStructure(doc.offering_id, profileId, { actor: "box_completion" }, drive);
    if (!mapping || mapping.status !== "active") return { filed: 0 };
    const version = String(sig.signed_file_version_id ?? doc.current_version ?? "1");
    const { data: already } = await db.from("drive_filed_documents").select("target").eq("source_table", "document_signatures").eq("source_id", sig.id).eq("version", version);
    const done = new Set((already ?? []).map((r: any) => r.target));
    const targets = filingTargets(`${doc.doc_type ?? ""} ${doc.title ?? ""}`).filter((t) => !done.has(t));
    if (!targets.length) return { filed: 0 };
    const file = await db.storage.from("signed-documents").download(sig.pdf_path);
    if (file.error) throw new Error(file.error.message);
    const bytes = new Uint8Array(await file.data.arrayBuffer());
    const name = executedFileName(doc.title ?? "Document", sig.provider_completed_at ?? new Date().toISOString(), version);
    let filed = 0;
    for (const target of targets) {
      const folderId = mapping.subfolders[target];
      const key = `doc:${sig.id}:${version}:${target}`;
      const existing = await drive.findByKey(folderId, key);
      const up = existing ?? (await drive.uploadPdf(folderId, name, bytes, key));
      await db.from("drive_filed_documents").upsert(
        { source_table: "document_signatures", source_id: sig.id, version, target, drive_file_id: up.id, folder_id: folderId, file_name: name },
        { onConflict: "source_table,source_id,version,target" },
      );
      await logEvent(doc.offering_id, mapping.id, "document_filed", { signature_id: sig.id, version, target, drive_file_id: up.id }, { actor: "box_completion" });
      filed++;
    }
    return { filed };
  } catch (e: any) {
    console.error("[drive] filing failed", e);
    await logEvent(null, null, "filing_failed", { signature_id: signatureId, error: String(e?.message ?? e).slice(0, 300) }, { actor: "box_completion" }).catch(() => {});
    return { filed: 0, error: String(e?.message ?? e) };
  }
}

/** Deactivation only marks the mapping archived. Nothing in Drive is deleted. */
export async function archiveMapping(mappingId: string, who: Actor) {
  const db = await admin();
  const { data } = await db.from("drive_folder_mappings").update({ status: "archived", updated_at: new Date().toISOString() }).eq("id", mappingId).select("id,offering_id").single();
  await logEvent(data?.offering_id ?? null, mappingId, "archived", {}, who);
}
