/**
 * Investor Google Drive connection - controlled read-only intake from the
 * Restricted Investor Records repository. Super Administrators only; fails
 * closed when configuration or the repository safety check fails. Never creates,
 * renames or shares Drive folders and never writes to Drive.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/require-auth";
import { DRIVE_ID_PATTERN, INVESTOR_UNAVAILABLE } from "@/lib/drive-policy";

const idSchema = z.string().regex(DRIVE_ID_PATTERN);
const uuid = z.string().uuid();

async function db() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
}

/** Gate + fail-closed repository check. Returns the approved root. */
async function gate(context: any, attempted: string) {
  const s = await import("@/lib/drive-intake.server");
  const userId = await s.requireSuperAdmin(context, attempted);
  const env = s.intakeEnvironment();
  if (env !== "production") throw new Error(INVESTOR_UNAVAILABLE);
  const d = await import("@/lib/drive.server");
  const root = d.repositoryConfig().investor;
  const problems = root ? await d.investorRepositoryProblems("production").catch(() => [INVESTOR_UNAVAILABLE]) : [INVESTOR_UNAVAILABLE];
  if (!root || problems.length) {
    await s.logIntake(userId, "investor_drive_" + attempted, "denied", { repository: "investor", reason: "repository_check_failed" });
    throw new Error(INVESTOR_UNAVAILABLE);
  }
  return { userId, root, s, env };
}

async function pathOf(s: any, facts: any, rootId: string): Promise<string> {
  const chain = facts.ancestors.slice(0, facts.ancestors.indexOf(rootId)).reverse();
  const names = await Promise.all(chain.map((id: string) => s.gatewayRead.fileFacts(id).then((f: any) => f?.name ?? "Folder").catch(() => "Folder")));
  return ["Restricted Investor Records", ...names, facts.name].join(" / ");
}

/** Investments (Fund + profile) this investor holds, with their Drive connection state. */
export const getInvestorDriveIntake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ investorUserId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const s = await import("@/lib/drive-intake.server");
    await s.requireSuperAdmin(context, "investor_drive_view");
    const client = await db();
    const { data: obs } = await client.from("investor_onboardings").select("id,offering_id,investment_profile_id").eq("investor_user_id", data.investorUserId).not("investment_profile_id", "is", null);
    const offeringIds = [...new Set((obs ?? []).map((o: any) => o.offering_id))];
    const profileIds = [...new Set((obs ?? []).map((o: any) => o.investment_profile_id))];
    const [{ data: offerings }, { data: profiles }, { data: conns }, { data: imports }] = await Promise.all([
      offeringIds.length ? client.from("offerings").select("id,name").in("id", offeringIds) : { data: [] },
      profileIds.length ? client.from("investment_profiles").select("id,display_label,legal_name,profile_type").in("id", profileIds) : { data: [] },
      client.from("investor_drive_connections").select("*").eq("investor_user_id", data.investorUserId).eq("status", "connected"),
      profileIds.length ? client.from("drive_imported_documents").select("id,offering_id,investment_profile_id").eq("source_repository", "investor").in("investment_profile_id", profileIds) : { data: [] },
    ]);
    let repositoryReady = true;
    try {
      const d = await import("@/lib/drive.server");
      repositoryReady = Boolean(d.repositoryConfig().investor) && (await d.investorRepositoryProblems("production")).length === 0;
    } catch {
      repositoryReady = false;
    }
    const seen = new Set<string>();
    const rows = (obs ?? []).filter((o: any) => { const k = `${o.offering_id}:${o.investment_profile_id}`; if (seen.has(k)) return false; seen.add(k); return true; }).map((o: any) => {
      const p = (profiles ?? []).find((x: any) => x.id === o.investment_profile_id);
      const c = (conns ?? []).find((x: any) => x.offering_id === o.offering_id && x.investment_profile_id === o.investment_profile_id);
      return {
        onboardingId: o.id as string,
        offeringId: o.offering_id as string,
        profileId: o.investment_profile_id as string,
        fundName: (offerings ?? []).find((x: any) => x.id === o.offering_id)?.name ?? "Fund",
        profileLabel: `${p?.display_label ?? p?.legal_name ?? "Profile"} (${String(p?.profile_type ?? "").replace(/_/g, " ")})`,
        connection: c ? { id: c.id as string, folderPath: c.folder_path as string, connectedAt: c.connected_at as string, lastCheckedAt: (c.last_checked_at as string) ?? null, lastCheck: c.last_check ?? null } : null,
        importedCount: (imports ?? []).filter((i: any) => i.offering_id === o.offering_id && i.investment_profile_id === o.investment_profile_id).length,
      };
    });
    return { repositoryReady, unavailableMessage: INVESTOR_UNAVAILABLE, rows };
  });

/** Search folders only inside the approved restricted repository. */
export const searchInvestorFolders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ q: z.string().trim().min(2).max(100) }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId, root, s } = await gate(context, "search");
    const { folderProblem } = await import("@/lib/investor-drive");
    const hits = (await s.gatewayRead.search(root.driveId, data.q)).filter((h: any) => h.mimeType === "application/vnd.google-apps.folder").slice(0, 20);
    const out = [];
    for (const h of hits) {
      const facts = await s.gatewayRead.fileFacts(h.id).catch(() => null);
      if (folderProblem(facts as any, root)) continue;
      out.push({ folderId: h.id as string, name: h.name as string, path: await pathOf(s, facts, root.rootId) });
    }
    await s.logIntake(userId, "investor_drive_search", "ok", { repository: "investor", results: out.length });
    return out;
  });

/** Explicitly connect one existing folder to one Fund + Investment Profile. Never creates or renames. */
export const connectInvestorFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ investorUserId: uuid, offeringId: uuid, profileId: uuid, folderId: idSchema, confirmPath: z.string().min(1).max(1000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId, root, s } = await gate(context, "connect");
    const { folderProblem } = await import("@/lib/investor-drive");
    const client = await db();
    const { data: ob } = await client.from("investor_onboardings").select("id").eq("investor_user_id", data.investorUserId).eq("offering_id", data.offeringId).eq("investment_profile_id", data.profileId);
    if ((ob ?? []).length !== 1) throw new Error("Fund / Investor / Investment Profile could not be determined unambiguously.");
    const facts = await s.gatewayRead.fileFacts(data.folderId).catch(() => null);
    const problem = folderProblem(facts as any, root);
    if (problem) {
      await s.logIntake(userId, "investor_drive_connect", "denied", { repository: "investor", offering_id: data.offeringId, investment_profile_id: data.profileId, reason: problem });
      throw new Error(problem);
    }
    const path = await pathOf(s, facts, root.rootId);
    if (path !== data.confirmPath) throw new Error("The Drive path changed - review it again before connecting.");
    const { data: holder } = await client.from("investor_drive_connections").select("offering_id,investment_profile_id").eq("folder_id", data.folderId).eq("status", "connected").maybeSingle();
    if (holder && (holder.offering_id !== data.offeringId || holder.investment_profile_id !== data.profileId)) {
      throw new Error("That folder is already connected to a different fund or profile.");
    }
    const { data: mapped } = await client.from("drive_folder_mappings").select("offering_id,investment_profile_id,entity_kind").eq("folder_id", data.folderId).neq("status", "archived");
    if ((mapped ?? []).some((m: any) => m.offering_id !== data.offeringId || (m.entity_kind === "investor" && m.investment_profile_id !== data.profileId))) {
      throw new Error("That folder is filed for a different fund or profile.");
    }
    const { data: existing } = await client.from("investor_drive_connections").select("id,folder_id").eq("offering_id", data.offeringId).eq("investment_profile_id", data.profileId).eq("status", "connected").maybeSingle();
    if (existing?.folder_id === data.folderId) return { id: existing.id as string, alreadyConnected: true };
    if (existing) throw new Error("Disconnect the current folder before connecting another.");
    const { data: row, error } = await client.from("investor_drive_connections").insert({
      offering_id: data.offeringId, investment_profile_id: data.profileId, onboarding_id: ob![0].id, investor_user_id: data.investorUserId,
      drive_id: root.driveId, folder_id: data.folderId, folder_path: path, connected_by: userId,
    }).select("id").single();
    if (error) throw new Error(error.message);
    await s.logIntake(userId, "investor_folder_connected", "ok", { repository: "investor", offering_id: data.offeringId, investment_profile_id: data.profileId, connection_id: row.id });
    return { id: row.id as string, alreadyConnected: false };
  });

export const disconnectInvestorFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ connectionId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const s = await import("@/lib/drive-intake.server");
    const userId = await s.requireSuperAdmin(context, "investor_drive_disconnect");
    const client = await db();
    const { data: row } = await client.from("investor_drive_connections").update({ status: "disconnected", disconnected_by: userId, disconnected_at: new Date().toISOString() }).eq("id", data.connectionId).eq("status", "connected").select("offering_id,investment_profile_id").maybeSingle();
    if (!row) throw new Error("That connection is not active.");
    // Imported documents stay exactly as they are.
    await s.logIntake(userId, "investor_folder_disconnected", "ok", { repository: "investor", offering_id: row.offering_id, investment_profile_id: row.investment_profile_id, connection_id: data.connectionId });
    return { ok: true };
  });

/** Read the connected folder (two levels) and compare with what Harmonious already holds. Nothing is imported. */
export const checkInvestorFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ connectionId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId, root, s } = await gate(context, "check");
    const L = await import("@/lib/investor-drive");
    const client = await db();
    const { data: conn } = await client.from("investor_drive_connections").select("*").eq("id", data.connectionId).eq("status", "connected").maybeSingle();
    if (!conn) throw new Error("That connection is not active.");
    const facts = await s.gatewayRead.fileFacts(conn.folder_id).catch(() => null);
    const problem = L.folderProblem(facts as any, root);
    if (problem) throw new Error(problem);
    const FOLDER = "application/vnd.google-apps.folder";
    const top = await s.gatewayRead.children(conn.folder_id);
    const files: any[] = top.filter((f: any) => f.mimeType !== FOLDER).map((f: any) => ({ ...f, location: "" }));
    for (const sub of top.filter((f: any) => f.mimeType === FOLDER).slice(0, 20)) {
      const kids = await s.gatewayRead.children(sub.id);
      files.push(...kids.filter((f: any) => f.mimeType !== FOLDER).map((f: any) => ({ ...f, location: sub.name })));
    }
    const { data: prior } = await client.from("drive_imported_documents").select("id,drive_file_id,drive_modified_at,drive_md5,offering_id,investment_profile_id,version_number").eq("source_repository", "investor");
    const ctx = { offeringId: conn.offering_id, profileId: conn.investment_profile_id };
    const items = files.slice(0, 200).map((f: any) => {
      const status = L.fileStatus({ id: f.id, name: f.name, mimeType: f.mimeType, modifiedTime: f.modifiedTime ?? null, md5Checksum: f.md5Checksum ?? null }, (prior ?? []) as any, ctx);
      const proposal = L.proposedClassification(f.name);
      return { driveFileId: f.id as string, name: f.name as string, mimeType: f.mimeType as string, location: f.location as string, modifiedTime: (f.modifiedTime as string) ?? null, status, label: L.STATUS_LABELS[status], proposal };
    });
    const missing = L.missingFromDrive(files as any, (prior ?? []) as any, ctx);
    const summary = {
      found: items.filter((i) => i.status !== "blocked").length,
      imported: items.filter((i) => i.status === "current").length,
      updated: items.filter((i) => i.status === "updated").length,
      needsReview: items.filter((i) => i.status === "other_context").length,
      blocked: items.filter((i) => i.status === "blocked").length,
      missing: missing.length,
    };
    await client.from("investor_drive_connections").update({ last_checked_at: new Date().toISOString(), last_check: summary }).eq("id", conn.id);
    await s.logIntake(userId, "investor_drive_checked", "ok", { repository: "investor", offering_id: conn.offering_id, investment_profile_id: conn.investment_profile_id, ...summary });
    for (const i of items.filter((x) => x.status === "updated")) {
      await s.logIntake(userId, "newer_drive_version_detected", "ok", { repository: "investor", drive_file_id: i.driveFileId, offering_id: conn.offering_id, investment_profile_id: conn.investment_profile_id });
    }
    return { summary, items, missingCount: missing.length };
  });

/** Deliberate import of selected files through the canonical importer (dedupe, versions, private storage). */
export const importInvestorDriveFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      connectionId: uuid,
      files: z.array(z.object({ driveFileId: idSchema, documentType: z.enum(["subscription_agreement", "executed_subscription_agreement", "accreditation_evidence", "side_letter", "investor_correspondence", "other_investor"]), importAsNewVersion: z.boolean().default(false) })).min(1).max(25),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId, root, s, env } = await gate(context, "import");
    const L = await import("@/lib/investor-drive");
    const client = await db();
    const { data: conn } = await client.from("investor_drive_connections").select("*").eq("id", data.connectionId).eq("status", "connected").maybeSingle();
    if (!conn) throw new Error("That connection is not active.");
    const { repositoryConfig } = await import("@/lib/drive.server");
    const { importOne } = await import("@/lib/drive-intake-core");
    const store = await s.supabaseIntakeStore(userId);
    const results = [];
    for (const f of data.files) {
      await s.logIntake(userId, "investor_drive_import_attempted", "ok", { repository: "investor", drive_file_id: f.driveFileId, offering_id: conn.offering_id, investment_profile_id: conn.investment_profile_id });
      const facts = await s.gatewayRead.fileFacts(f.driveFileId).catch(() => null);
      // Must sit inside the connected folder of the approved repository.
      if (!facts || facts.driveId !== root.driveId || !facts.ancestors.includes(conn.folder_id)) {
        results.push({ driveFileId: f.driveFileId, ok: false, outcome: "rejected", message: "That file is not inside the connected investor folder." });
        continue;
      }
      if (L.isBlockedFromInvestorDrive(facts.name)) {
        await s.logIntake(userId, "investor_drive_import_blocked", "denied", { repository: "investor", drive_file_id: f.driveFileId, offering_id: conn.offering_id, investment_profile_id: conn.investment_profile_id });
        results.push({ driveFileId: f.driveFileId, ok: false, outcome: "blocked", message: L.BLOCKED_MESSAGE });
        continue;
      }
      const r: any = await importOne(
        { driveFileId: f.driveFileId, repository: "investor", offeringId: conn.offering_id, profileId: conn.investment_profile_id, onboardingId: conn.onboarding_id, category: "investor", documentType: f.documentType, classification: "investor_restricted", recordStatus: "historical", importAsNewVersion: f.importAsNewVersion } as any,
        { env, config: repositoryConfig(), userId, drive: s.gatewayRead, store },
      );
      if (r.outcome === "already_imported") r.message = L.ALREADY_IMPORTED;
      if (r.outcome === "changed_source") r.message = L.UPDATED_MESSAGE;
      await s.logIntake(userId, r.ok ? "investor_drive_import_completed" : "investor_drive_import_not_completed", r.ok ? "ok" : String(r.outcome), { repository: "investor", drive_file_id: f.driveFileId, offering_id: conn.offering_id, investment_profile_id: conn.investment_profile_id, document_id: r.documentId ?? null });
      results.push(r);
    }
    return { results };
  });
