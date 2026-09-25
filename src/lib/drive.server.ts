// Server-only: Google Drive filing for Harmonious funds and investors.
// Drive is a repository; Harmonious records remain authoritative.

import {
  DriveConflictError,
  FOLDER_MIME,
  FUND_SUBFOLDERS,
  INVESTOR_FUND_SUBFOLDERS,
  INVESTOR_SUBFOLDERS,
  ensureSubfolders,
  ensureTaggedFolder,
  executedFileName,
  filingTargets,
  fundKey,
  investorFolderName,
  investorFundKey,
  investorKey,
  safeName,
  type DriveClient,
  type DriveFile,
} from "@/lib/drive-structure";
import {
  INVESTOR_UNAVAILABLE,
  TEST_UNAVAILABLE,
  classifyDocument,
  destinationDecision,
  exceptionKey,
  issueAfterAttempts,
  linkProblem,
  repositoryAuditProblems,
  repositoryConfigProblem,
  repositoryFor,
  routeDocument,
  type DestinationAudit,
  type DriveEnvironment,
  type DrivePrincipal,
  type DriveRepository,
  type FolderFacts,
  type RepositoryAudit,
  type RepositoryConfig,
  type RepositoryRoot,
} from "@/lib/drive-policy";

const GATEWAY = "https://connector-gateway.lovable.dev/google_drive";
/** Harmonious Team shared drive → Funds. Fund General records only. */
export const PRODUCTION_ROOT = "1ObGXOWYDm0XGgf0YyTqA8YTc6A3aS0Ak";
export const SHARED_DRIVE_ID = "0APbA-DxnxQINUk9PVA";

const env = (k: string) => (process.env[k] ?? "").trim() || null;
const pair = (root: string | null, drive: string | null): RepositoryRoot | null => (root && drive ? { rootId: root, driveId: drive } : null);

/** Three separately configured roots. None is ever derived from another. */
export function repositoryConfig(): RepositoryConfig {
  return {
    fund: pair(env("GOOGLE_DRIVE_FUND_ROOT_FOLDER_ID") ?? env("GOOGLE_DRIVE_ROOT_FOLDER_ID") ?? PRODUCTION_ROOT, env("GOOGLE_DRIVE_FUND_DRIVE_ID") ?? SHARED_DRIVE_ID),
    investor: pair(env("GOOGLE_DRIVE_INVESTOR_ROOT_FOLDER_ID"), env("GOOGLE_DRIVE_INVESTOR_DRIVE_ID")),
    test: pair(env("GOOGLE_DRIVE_QA_ROOT_FOLDER_ID"), env("GOOGLE_DRIVE_QA_DRIVE_ID")),
  };
}

function rootOf(repo: DriveRepository): RepositoryRoot {
  const c = repositoryConfig();
  const problem = repositoryConfigProblem(c);
  const r = c[repo];
  if (repo === "test" && (!r || problem)) throw new Error(TEST_UNAVAILABLE);
  if (repo === "investor" && (!r || problem)) throw new Error(INVESTOR_UNAVAILABLE);
  if (!r || problem) throw new Error(problem ?? "Fund Drive repository unavailable");
  return r;
}

const approvedRestrictedAudience = () =>
  String(process.env["GOOGLE_DRIVE_RESTRICTED_AUDIENCE"] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

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
    const err: any = new Error(`Google Drive request failed [${res.status}]: ${body.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

const COMMON = "supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives";

async function list(query: string): Promise<DriveFile[]> {
  const params = `q=${encodeURIComponent(query)}&fields=${encodeURIComponent("files(id,name,appProperties)")}&${COMMON}`;
  const data = await call(`/drive/v3/files?${params}`);
  return data.files ?? [];
}

export interface DriveInspector {
  folderFacts(id: string): Promise<FolderFacts | null>;
  audit(id: string): Promise<DestinationAudit>;
  repositoryAudit(driveId: string): Promise<RepositoryAudit | null>;
}

export const gatewayDrive: DriveClient & DriveInspector = {
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
  async folderFacts(id) {
    const f = async (fid: string) =>
      call(`/drive/v3/files/${encodeURIComponent(fid)}?supportsAllDrives=true&fields=id,mimeType,trashed,driveId,parents`).catch(
        (e: any) => {
          if (e?.status === 404) return null;
          throw e;
        },
      );
    const first = await f(id);
    if (!first) return null;
    const ancestors: string[] = [];
    let parent: string | undefined = first.parents?.[0];
    for (let i = 0; parent && i < 12; i++) {
      ancestors.push(parent);
      if (parent === first.driveId) break;
      const next = await f(parent);
      parent = next?.parents?.[0];
    }
    return { id: first.id, mimeType: first.mimeType, trashed: first.trashed, driveId: first.driveId ?? null, ancestors };
  },
  async audit(id) {
    const facts = await this.folderFacts(id);
    let limitedAccess = false;
    for (const fid of [id, ...(facts?.ancestors ?? [])]) {
      if (fid === facts?.driveId) break;
      const meta = await call(`/drive/v3/files/${encodeURIComponent(fid)}?supportsAllDrives=true&fields=inheritedPermissionsDisabled`);
      if (meta.inheritedPermissionsDisabled) {
        limitedAccess = true;
        break;
      }
    }
    const perms = await call(
      `/drive/v3/files/${encodeURIComponent(id)}/permissions?supportsAllDrives=true&fields=permissions(type,role,emailAddress,domain)`,
    );
    const principals: DrivePrincipal[] = (perms.permissions ?? []).map((p: any) => ({
      type: p.type,
      role: p.role,
      email: p.emailAddress ?? null,
      domain: p.domain ?? null,
    }));
    return { limitedAccess, principals };
  },
  async repositoryAudit(driveId) {
    try {
      const drive = await call(`/drive/v3/drives/${encodeURIComponent(driveId)}?fields=restrictions`);
      const perms = await call(
        `/drive/v3/files/${encodeURIComponent(driveId)}/permissions?supportsAllDrives=true&fields=permissions(type,role,emailAddress,domain)`,
      );
      const r = drive.restrictions ?? {};
      return {
        domainUsersOnly: Boolean(r.domainUsersOnly),
        driveMembersOnly: Boolean(r.driveMembersOnly),
        sharingFoldersRequiresOrganizerPermission: Boolean(r.sharingFoldersRequiresOrganizerPermission),
        members: (perms.permissions ?? []).map((p: any) => ({ type: p.type, role: p.role, email: p.emailAddress ?? null, domain: p.domain ?? null })),
      };
    } catch {
      return null;
    }
  },
};

/** Problems with the repository that would hold investor-level records. Empty = safe. */
export async function investorRepositoryProblems(envName: DriveEnvironment, inspector: DriveInspector = gatewayDrive): Promise<string[]> {
  const c = repositoryConfig();
  const r = envName === "test" ? c.test : c.investor;
  if (!r) return [envName === "test" ? TEST_UNAVAILABLE : INVESTOR_UNAVAILABLE];
  const problem = repositoryConfigProblem(c);
  if (problem) return [problem];
  return repositoryAuditProblems(await inspector.repositoryAudit(r.driveId), approvedRestrictedAudience());
}

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

/** One open Operations task per problem. A retry bumps the count, never adds a task. */
export async function raiseDriveException(input: {
  key: string;
  issue: string;
  offeringId?: string | null;
  profileId?: string | null;
  mappingId?: string | null;
  sourceTable?: string | null;
  sourceId?: string | null;
  detail: string;
  action: string;
}) {
  const db = await admin();
  const now = new Date().toISOString();
  const { data: open } = await db.from("drive_exceptions").select("id,attempts").eq("dedupe_key", input.key).eq("status", "open").maybeSingle();
  if (open) {
    const attempts = (open.attempts ?? 1) + 1;
    await db
      .from("drive_exceptions")
      .update({ attempts, issue_type: issueAfterAttempts(input.issue, attempts), detail: input.detail.slice(0, 500), last_action: input.action, updated_at: now })
      .eq("id", open.id);
    return open.id as string;
  }
  const { data, error } = await db
    .from("drive_exceptions")
    .insert({
      dedupe_key: input.key,
      issue_type: input.issue,
      offering_id: input.offeringId ?? null,
      investment_profile_id: input.profileId ?? null,
      mapping_id: input.mappingId ?? null,
      source_table: input.sourceTable ?? null,
      source_id: input.sourceId ?? null,
      detail: input.detail.slice(0, 500),
      last_action: input.action,
    })
    .select("id")
    .single();
  if (error && !/duplicate/i.test(error.message)) throw new Error(error.message);
  return data?.id as string | undefined;
}

export async function resolveDriveException(key: string, userId?: string | null) {
  const db = await admin();
  await db
    .from("drive_exceptions")
    .update({ status: "resolved", resolved_at: new Date().toISOString(), resolved_by: userId ?? null, updated_at: new Date().toISOString() })
    .eq("dedupe_key", key)
    .eq("status", "open");
}

/** A mapped folder that has disappeared is reported, never silently recreated. */
async function stillThere(inspector: DriveInspector, folderId: string) {
  const facts = await inspector.folderFacts(folderId);
  return Boolean(facts && !facts.trashed);
}

type Deps = { drive?: DriveClient; inspector?: DriveInspector };

/** Create (or re-find) the fund folder and its subfolders. Idempotent. */
export async function ensureFundStructure(offeringId: string, who: Actor = {}, deps: Deps = {}) {
  const drive = deps.drive ?? gatewayDrive;
  const inspector = deps.inspector ?? gatewayDrive;
  const db = await admin();
  const { data: offering } = await db.from("offerings").select("id,name,legal_entity_name").eq("id", offeringId).maybeSingle();
  if (!offering) throw new Error("Fund not found.");
  const key = fundKey(offeringId);
  const exKey = exceptionKey("fund", offeringId);
  const { data: existing } = await db.from("drive_folder_mappings").select("*").eq("harmonious_key", key).maybeSingle();
  if (existing?.status === "archived") return existing;
  const env: DriveEnvironment = existing?.environment ?? "production";
  const name = safeName(offering.name ?? offering.legal_entity_name ?? "Fund");
  try {
    let folderId: string = existing?.folder_id;
    if (folderId && !(await stillThere(inspector, folderId))) {
      const mapping = await upsertMapping({ entity_kind: "fund", offering_id: offeringId, harmonious_key: key, status: "needs_attention", last_error: "The linked Drive folder no longer exists." });
      await raiseDriveException({ key: exKey, issue: "mapping_missing", offeringId, mappingId: mapping.id, detail: mapping.last_error, action: "sync" });
      await logEvent(offeringId, mapping.id, "mapping_missing", { folder_id: folderId }, who);
      return mapping;
    }
    if (!folderId) {
      const res = await ensureTaggedFolder(drive, driveRootId(env), name, key);
      folderId = res.folder.id;
      if (res.created) await logEvent(offeringId, existing?.id ?? null, "folder_created", { folder_id: folderId, name }, who);
    } else if (existing.folder_name && existing.folder_name !== name) {
      await drive.renameFolder(folderId, name);
      await logEvent(offeringId, existing.id, "folder_renamed", { folder_id: folderId, from: existing.folder_name, to: name }, who);
    }
    const { subfolders, created } = await ensureSubfolders(drive, folderId, key, FUND_SUBFOLDERS, existing?.subfolders ?? {});
    const mapping = await upsertMapping({
      entity_kind: "fund", offering_id: offeringId, harmonious_key: key, folder_id: folderId, folder_name: name,
      subfolders, status: "active", last_error: null, last_synced_at: new Date().toISOString(), environment: env,
    });
    for (const s of created) await logEvent(offeringId, mapping.id, "subfolder_created", { name: s, folder_id: subfolders[s] }, who);
    await resolveDriveException(exKey, who.userId);
    return mapping;
  } catch (e: any) {
    const conflict = e instanceof DriveConflictError;
    const message = String(e?.message ?? e).slice(0, 500);
    const mapping = await upsertMapping({
      entity_kind: "fund", offering_id: offeringId, harmonious_key: key, folder_name: name,
      status: conflict ? "conflict" : "needs_attention", last_error: message,
    });
    await logEvent(offeringId, mapping.id, conflict ? "conflict" : "sync_failed", {
      error: message.slice(0, 300), ...(conflict ? { existing_ids: e.existingIds } : {}),
    }, who);
    await raiseDriveException({ key: exKey, issue: conflict ? "conflict" : "needs_attention", offeringId, mappingId: mapping.id, detail: message, action: "create fund folder" });
    return mapping;
  }
}

/**
 * Link an existing folder by pasted ID. The ID is never trusted: the server
 * confirms it exists, is a folder, sits in the Harmonious shared drive under
 * the right root, and is not already linked to anything else.
 */
export async function linkExistingFolder(
  input: { offeringId: string; profileId?: string | null; folderId: string; reason?: string | null },
  who: Actor,
  deps: Deps = {},
) {
  const inspector = deps.inspector ?? gatewayDrive;
  const db = await admin();
  const key = input.profileId ? investorKey(input.offeringId, input.profileId) : fundKey(input.offeringId);
  const { data: previous } = await db.from("drive_folder_mappings").select("*").eq("harmonious_key", key).maybeSingle();
  const env: DriveEnvironment = previous?.environment ?? "production";
  const roots = driveRoots();
  const { data: holders } = await db.from("drive_folder_mappings").select("harmonious_key").eq("folder_id", input.folderId);
  let root = driveRootId(env);
  if (input.profileId) {
    const { data: fund } = await db.from("drive_folder_mappings").select("folder_id,subfolders,status").eq("harmonious_key", fundKey(input.offeringId)).maybeSingle();
    if (!fund?.folder_id || fund.status !== "active") throw new Error("Link or create this fund's folder first.");
    root = fund.subfolders?.["Investors"] ?? fund.folder_id;
  }
  const facts = await inspector.folderFacts(input.folderId);
  const problem = linkProblem({
    folder: facts,
    expectedDriveId: SHARED_DRIVE_ID,
    root,
    otherRoot: env === "production" ? roots.test : roots.production,
    mappedTo: (holders ?? []).map((h: any) => h.harmonious_key),
    targetKey: key,
  });
  if (problem) {
    await logEvent(input.offeringId, previous?.id ?? null, "link_rejected", { folder_id: input.folderId.slice(0, 100), reason: problem }, who);
    throw new Error(problem);
  }
  const permissionAudit = await inspector.audit(input.folderId).catch(() => null);
  const mapping = await upsertMapping({
    entity_kind: input.profileId ? "investor" : "fund",
    offering_id: input.offeringId,
    investment_profile_id: input.profileId ?? null,
    harmonious_key: key,
    folder_id: input.folderId,
    status: "pending",
    last_error: null,
    environment: env,
    permission_audit: permissionAudit,
    subfolders: previous?.folder_id === input.folderId ? previous.subfolders : {},
  });
  await logEvent(input.offeringId, mapping.id, "folder_linked", {
    previous_folder_id: previous?.folder_id ?? null,
    folder_id: input.folderId,
    reason: input.reason?.slice(0, 300) ?? null,
  }, who);
  return input.profileId
    ? ensureInvestorStructure(input.offeringId, input.profileId, who, deps)
    : ensureFundStructure(input.offeringId, who, deps);
}

/** Investor folder for one Investment Profile within one fund. */
export async function ensureInvestorStructure(offeringId: string, profileId: string, who: Actor = {}, deps: Deps = {}) {
  const drive = deps.drive ?? gatewayDrive;
  const inspector = deps.inspector ?? gatewayDrive;
  const db = await admin();
  const exKey = exceptionKey("investor", offeringId, profileId);
  const fund = await ensureFundStructure(offeringId, who, deps);
  if (fund.status !== "active") return null;
  const { data: profile } = await db.from("investment_profiles").select("id,profile_type,legal_name,display_label").eq("id", profileId).maybeSingle();
  if (!profile) throw new Error("Investment profile not found.");
  const key = investorKey(offeringId, profileId);
  const name = investorFolderName(profile.legal_name ?? profile.display_label ?? "Investor", profile.profile_type);
  const { data: existing } = await db.from("drive_folder_mappings").select("*").eq("harmonious_key", key).maybeSingle();
  if (existing?.status === "archived") return existing;
  try {
    let folderId: string = existing?.folder_id;
    if (folderId && !(await stillThere(inspector, folderId))) {
      const mapping = await upsertMapping({ entity_kind: "investor", offering_id: offeringId, investment_profile_id: profileId, harmonious_key: key, status: "needs_attention", last_error: "The linked Drive folder no longer exists." });
      await raiseDriveException({ key: exKey, issue: "mapping_missing", offeringId, profileId, mappingId: mapping.id, detail: mapping.last_error, action: "sync" });
      return mapping;
    }
    if (!folderId) {
      const res = await ensureTaggedFolder(drive, fund.subfolders["Investors"], name, key);
      folderId = res.folder.id;
      if (res.created) await logEvent(offeringId, existing?.id ?? null, "folder_created", { folder_id: folderId, kind: "investor" }, who);
    } else if (existing.folder_name && existing.folder_name !== name) {
      await drive.renameFolder(folderId, name);
    }
    const { subfolders } = await ensureSubfolders(drive, folderId, key, INVESTOR_SUBFOLDERS, existing?.subfolders ?? {});
    const mapping = await upsertMapping({
      entity_kind: "investor", offering_id: offeringId, investment_profile_id: profileId, harmonious_key: key,
      folder_id: folderId, folder_name: name, subfolders, status: "active", last_error: null,
      last_synced_at: new Date().toISOString(), environment: fund.environment ?? "production",
    });
    await resolveDriveException(exKey, who.userId);
    return mapping;
  } catch (e: any) {
    const conflict = e instanceof DriveConflictError;
    const message = String(e?.message ?? e).slice(0, 500);
    const mapping = await upsertMapping({
      entity_kind: "investor", offering_id: offeringId, investment_profile_id: profileId, harmonious_key: key,
      folder_name: name, status: conflict ? "conflict" : "needs_attention", last_error: message,
    });
    await logEvent(offeringId, mapping.id, conflict ? "conflict" : "sync_failed", { error: message.slice(0, 300) }, who);
    await raiseDriveException({ key: exKey, issue: conflict ? "conflict" : "needs_attention", offeringId, profileId, mappingId: mapping.id, detail: message, action: "create investor folder" });
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
 * Files the executed PDF only where the destination's real audience fits the
 * document's classification; otherwise withholds and raises a task. Replays
 * are no-ops. Never throws: the signing workflow carries on either way.
 */
export async function fileExecutedSignature(signatureId: string, deps: Deps = {}) {
  const drive = deps.drive ?? gatewayDrive;
  const inspector = deps.inspector ?? gatewayDrive;
  const exKey = exceptionKey("file", signatureId);
  let offeringId: string | null = null;
  try {
    const db = await admin();
    const { data: sig } = await db
      .from("document_signatures")
      .select("id,application_id,offering_document_id,investment_profile_id,provider_status,pdf_path,provider_completed_at,cancelled_at,superseded_by,signed_file_version_id")
      .eq("id", signatureId)
      .maybeSingle();
    if (!sig || sig.provider_status !== "completed" || sig.cancelled_at || sig.superseded_by || !sig.pdf_path) return { filed: 0 };
    const { data: doc } = await db.from("offering_documents").select("offering_id,title,doc_type,current_version").eq("id", sig.offering_document_id).maybeSingle();
    if (!doc || neverInDrive(`${doc.doc_type ?? ""} ${doc.title ?? ""}`) || !(await enabled(doc.offering_id))) return { filed: 0 };
    offeringId = doc.offering_id;
    let profileId = sig.investment_profile_id as string | null;
    if (!profileId) {
      const { data: ob } = await db.from("investor_onboardings").select("investment_profile_id").eq("application_id", sig.application_id).maybeSingle();
      profileId = ob?.investment_profile_id ?? null;
    }
    if (!profileId) return { filed: 0 };
    const mapping = await ensureInvestorStructure(doc.offering_id, profileId, { actor: "box_completion" }, deps);
    if (!mapping || mapping.status !== "active") return { filed: 0 };
    const classification = classifyDocument(doc.doc_type, doc.title);
    const version = String(sig.signed_file_version_id ?? doc.current_version ?? "1");
    const { data: already } = await db.from("drive_filed_documents").select("target").eq("source_table", "document_signatures").eq("source_id", sig.id).eq("version", version);
    const done = new Set((already ?? []).map((r: any) => r.target));
    const targets = filingTargets(`${doc.doc_type ?? ""} ${doc.title ?? ""}`).filter((t) => !done.has(t));
    if (!targets.length) return { filed: 0 };

    for (const target of targets) {
      const decision = destinationDecision(classification, await inspector.audit(mapping.subfolders[target]), approvedRestrictedAudience());
      if (!decision.allowed) {
        await raiseDriveException({
          key: exKey, issue: "permission_too_broad", offeringId, profileId, mappingId: mapping.id,
          sourceTable: "document_signatures", sourceId: sig.id, detail: decision.reason, action: `file to ${target}`,
        });
        await logEvent(doc.offering_id, mapping.id, "filing_withheld", { signature_id: sig.id, target, classification }, { actor: "box_completion" });
        return { filed: 0, withheld: decision.reason };
      }
    }

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
        { source_table: "document_signatures", source_id: sig.id, version, target, drive_file_id: up.id, folder_id: folderId, file_name: name, classification },
        { onConflict: "source_table,source_id,version,target" },
      );
      await logEvent(doc.offering_id, mapping.id, "document_filed", { signature_id: sig.id, version, target, drive_file_id: up.id, classification }, { actor: "box_completion" });
      filed++;
    }
    await resolveDriveException(exKey);
    return { filed };
  } catch (e: any) {
    const message = String(e?.message ?? e);
    console.error("[drive] filing failed", e);
    await raiseDriveException({ key: exKey, issue: "upload_failed", offeringId, sourceTable: "document_signatures", sourceId: signatureId, detail: message, action: "file executed document" }).catch(() => {});
    await logEvent(offeringId, null, "filing_failed", { signature_id: signatureId, error: message.slice(0, 300) }, { actor: "box_completion" }).catch(() => {});
    return { filed: 0, error: message };
  }
}

/** Deactivation only marks the mapping archived. Nothing in Drive is deleted. */
export async function archiveMapping(mappingId: string, who: Actor) {
  const db = await admin();
  const { data } = await db.from("drive_folder_mappings").update({ status: "archived", updated_at: new Date().toISOString() }).eq("id", mappingId).select("id,offering_id").single();
  await logEvent(data?.offering_id ?? null, mappingId, "archived", {}, who);
}
