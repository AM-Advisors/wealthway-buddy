/**
 * Fund migration from Google Drive. Server-only.
 * Staff pick an existing folder (or create a new one), every file is listed for review,
 * and only rows staff accept are moved/copied into the standard fund folders and imported
 * through the existing Drive intake (importOne). Fund details read from documents are
 * suggestions only; accepting one goes through the canonical fund/investor services.
 */
import { FUND_SUBFOLDERS, FOLDER_MIME, fundKey, safeName } from "@/lib/drive-structure";
import { classifyDocument, type DriveRepository } from "@/lib/drive-policy";
import { SUPPORTED_MIME, isRestrictedEvidence, DOCUMENT_TYPES } from "@/lib/drive-intake";

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
const MANAGERS = ["super_admin", "admin", "operations", "executive"];
const VIEWERS = [...MANAGERS, "leadership", "fund_administration"];

async function rolesOf(userId: string) {
  const db = await admin();
  const { data } = await db.from("user_roles").select("role").eq("user_id", userId);
  return ((data ?? []) as any[]).map((r) => String(r.role));
}
export async function requireManager(userId: string) {
  const r = await rolesOf(userId);
  if (!r.some((x) => MANAGERS.includes(x))) throw new Error("Only Super Admins and Operations leads can migrate funds.");
}
async function requireViewer(userId: string) {
  const r = await rolesOf(userId);
  if (!r.some((x) => VIEWERS.includes(x))) throw new Error("Only Harmonious Operations can view fund migrations.");
  return r.some((x) => MANAGERS.includes(x));
}
async function event(migrationId: string, actor: string | null, kind: string, detail: Record<string, unknown> = {}) {
  const db = await admin();
  await db.from("drive_migration_events").insert({ migration_id: migrationId, actor_user_id: actor, kind, detail });
}
const drive = async () => await import("@/lib/drive.server");
const qs = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

// ---------------------------------------------------------------- folder picker
export async function folderSources(userId: string) {
  await requireViewer(userId);
  const { call, repositoryConfig } = await drive();
  const drives = await call(`/drive/v3/drives?pageSize=100&fields=drives(id,name)`).catch(() => ({ drives: [] }));
  const fund = repositoryConfig().fund;
  return {
    fundsRoot: fund ? { id: fund.rootId, name: "Harmonious Funds" } : null,
    sources: [
      ...(fund ? [{ id: fund.rootId, name: "Harmonious Funds (shared drive)" }] : []),
      ...((drives.drives ?? []) as any[]).map((d) => ({ id: d.id, name: `${d.name} (shared drive)` })),
      { id: "root", name: "My Drive" },
    ],
  };
}

export async function searchFolders(userId: string, input: { query?: string | null | undefined; parentId?: string | null | undefined }) {
  await requireViewer(userId);
  const { call, repositoryConfig } = await drive();
  const conds = [`mimeType='${FOLDER_MIME}'`, "trashed=false"];
  if (input.parentId) conds.push(`'${qs(input.parentId)}' in parents`);
  if (input.query?.trim()) conds.push(`name contains '${qs(input.query.trim())}'`);
  const params = new URLSearchParams({
    q: conds.join(" and "), pageSize: "50", orderBy: "name",
    fields: "files(id,name,driveId,parents,modifiedTime)", supportsAllDrives: "true", includeItemsFromAllDrives: "true", corpora: "allDrives",
  });
  const data = await call(`/drive/v3/files?${params}`);
  const files = (data.files ?? []) as any[];
  const db = await admin();
  const ids = files.map((f) => f.id);
  const { data: maps } = ids.length ? await db.from("drive_folder_mappings").select("folder_id, offering_id, status").in("folder_id", ids).neq("status", "archived") : { data: [] };
  const offIds = [...new Set(((maps ?? []) as any[]).map((m) => m.offering_id).filter(Boolean))];
  const { data: offs } = offIds.length ? await db.from("offerings").select("id, name").in("id", offIds) : { data: [] };
  const on = new Map(((offs ?? []) as any[]).map((o) => [o.id, o.name]));
  const fundDrive = repositoryConfig().fund?.driveId ?? null;
  return files.map((f) => {
    const m = ((maps ?? []) as any[]).find((x) => x.folder_id === f.id);
    return { id: f.id, name: f.name, modifiedTime: f.modifiedTime ?? null, inFundsDrive: !!fundDrive && f.driveId === fundDrive, linkedTo: m ? on.get(m.offering_id) ?? "another record" : null };
  });
}

// ---------------------------------------------------------------- classification
const FUND_DEST: Record<string, (typeof FUND_SUBFOLDERS)[number]> = {
  operating_agreement: "01 - Fund Documents", other_fund: "01 - Fund Documents",
  formation: "02 - Formation & Regulatory", regulatory_filing: "02 - Formation & Regulatory",
  banking: "03 - Banking", tax_deliverable: "04 - Accounting & Tax", financial_report: "05 - Reports",
};
export const destinationFor = (category: string | null, type: string | null) =>
  category === "investor" ? "Investor's folder (Investor Records)" : FUND_DEST[type ?? ""] ?? "01 - Fund Documents";

export function guessType(name: string, path: string): { category: "fund" | "investor"; type: string; reason: string; investorName: string | null } {
  const t = `${path} ${name}`.toLowerCase();
  const inv = investorFrom(name, path);
  const r = (category: "fund" | "investor", type: string, reason: string) => ({ category, type, reason, investorName: category === "investor" ? inv : null });
  if (/side letter/.test(t)) return r("investor", "side_letter", "Name says side letter");
  if (/accredit/.test(t)) return r("investor", "accreditation_evidence", "Name says accreditation");
  if (/(subscription|sub doc|subdoc|joinder|signature page)/.test(t)) return r("investor", /(executed|signed|countersigned|fully)/.test(t) ? "executed_subscription_agreement" : "subscription_agreement", "Name says subscription");
  if (/(operating agreement|\blpa\b|limited partnership agreement|\boa\b|llc agreement|ppm|private placement|memorandum)/.test(t)) return r("fund", "operating_agreement", "Name says governing document");
  if (/(certificate of (formation|limited partnership)|articles of|formation|\bein\b|cp ?575|ss-?4|good standing)/.test(t)) return r("fund", "formation", "Name says formation / EIN");
  if (/(form d|blue sky|sec filing|regulatory|annual report)/.test(t)) return r("fund", "regulatory_filing", "Name says regulatory filing");
  if (/(k-?1|1065|tax return|\btax\b|w-?9|1099)/.test(t)) return r("fund", "tax_deliverable", "Name says tax");
  if (/(bank|wire|ach|mercury|svb|statement)/.test(t)) return r("fund", "banking", "Name says banking");
  if (/(financial|\bnav\b|capital account|quarterly|report|audit|balance sheet)/.test(t)) return r("fund", "financial_report", "Name says report");
  if (inv) return r("investor", "investor_correspondence", "Sits in an investor folder");
  return r("fund", "other_fund", "Couldn't tell from the name");
}
function investorFrom(name: string, path: string): string | null {
  const parts = path.split("/").map((s) => s.trim()).filter(Boolean);
  const i = parts.findIndex((p) => /^(investors?|lps?|limited partners|subscriptions?)$/i.test(p.replace(/^\d+\s*-\s*/, "")));
  if (i >= 0 && parts[i + 1]) return parts[i + 1]!;
  const m = name.replace(/\.[a-z0-9]+$/i, "").match(/(?:subscription|sub doc|side letter|joinder|accreditation)[^-–_]*[-–_]\s*(.+)$/i);
  return m?.[1]?.trim() || null;
}

// ---------------------------------------------------------------- start + scan
async function listChildren(folderId: string) {
  const { call } = await drive();
  const out: any[] = [];
  let token: string | undefined;
  do {
    const params = new URLSearchParams({
      q: `'${qs(folderId)}' in parents and trashed=false`, pageSize: "200",
      fields: "nextPageToken,files(id,name,mimeType,size,modifiedTime,driveId)", supportsAllDrives: "true", includeItemsFromAllDrives: "true",
      ...(token ? { pageToken: token } : {}),
    });
    const d = await call(`/drive/v3/files?${params}`);
    out.push(...(d.files ?? []));
    token = d.nextPageToken;
  } while (token && out.length < 2000);
  return out;
}

export async function startMigration(userId: string, input: { offeringId: string; folderId: string | null }) {
  await requireManager(userId);
  const db = await admin();
  const d = await drive();
  await db.from("offerings").update({ drive_sync_enabled: true }).eq("id", input.offeringId);
  if (!input.folderId) {
    const m = await d.ensureFundStructure(input.offeringId, { userId });
    return { migrationId: null, status: String(m?.status ?? "needs_attention"), error: (m?.last_error as string | null) ?? null };
  }
  const folder = await d.call(`/drive/v3/files/${encodeURIComponent(input.folderId)}?supportsAllDrives=true&fields=id,name,mimeType,driveId`).catch(() => null);
  if (!folder || folder.mimeType !== FOLDER_MIME) throw new Error("That folder can't be opened with the connected Google account.");
  const { data: held } = await db.from("drive_folder_mappings").select("harmonious_key").eq("folder_id", folder.id).neq("status", "archived");
  if (((held ?? []) as any[]).some((h) => h.harmonious_key !== fundKey(input.offeringId))) throw new Error("That folder is already linked to another record.");

  // Inside the Funds drive under the Funds root: link it. Anywhere else: create the standard folder and copy into it.
  let mode: "link" | "copy" = "copy";
  if (folder.driveId && folder.driveId === d.repositoryConfig().fund?.driveId) {
    try { const m = await d.linkExistingFolder({ offeringId: input.offeringId, folderId: folder.id, reason: "Fund migration" }, { userId }); if (m?.status === "active") mode = "link"; } catch { mode = "copy"; }
  }
  if (mode === "copy") {
    const m = await d.ensureFundStructure(input.offeringId, { userId });
    if (m?.status !== "active") throw new Error(m?.last_error ?? "The fund folder couldn't be created.");
  } else {
    await d.ensureFundStructure(input.offeringId, { userId }); // adds any missing standard subfolders
  }
  const { data: mig, error } = await db.from("drive_migrations").insert({
    offering_id: input.offeringId, source_folder_id: folder.id, source_folder_name: folder.name, source_drive_id: folder.driveId ?? null, mode, created_by: userId,
  }).select("id").single();
  if (error) throw new Error(error.message);
  await event(mig.id, userId, "started", { folder_id: folder.id, mode });
  await scan(mig.id, userId);
  return { migrationId: mig.id as string, status: "active", error: null };
}

export async function scan(migrationId: string, userId: string) {
  const db = await admin();
  const { data: mig } = await db.from("drive_migrations").select("*").eq("id", migrationId).single();
  const { data: mapping } = await db.from("drive_folder_mappings").select("subfolders, folder_id").eq("harmonious_key", fundKey(mig.offering_id)).maybeSingle();
  const skipFolders = new Set(Object.values((mapping?.subfolders ?? {}) as Record<string, string>));
  const { data: invs } = await db.from("investor_onboardings").select("id, investment_profile_id").eq("offering_id", mig.offering_id).is("removed_at", null);
  const pIds = ((invs ?? []) as any[]).map((o) => o.investment_profile_id).filter(Boolean);
  const { data: profs } = pIds.length ? await db.from("investment_profiles").select("id, legal_name, display_label").in("id", pIds) : { data: [] };
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const match = (n: string | null) => {
    if (!n) return null;
    const k = norm(n);
    const p = ((profs ?? []) as any[]).find((x) => [x.legal_name, x.display_label].some((v) => v && (norm(v).includes(k) || k.includes(norm(v)))));
    const ob = p && ((invs ?? []) as any[]).find((o) => o.investment_profile_id === p.id);
    return p ? { profileId: p.id as string, onboardingId: (ob?.id ?? null) as string | null } : null;
  };
  const rows: any[] = [];
  const walk = async (id: string, path: string, depth: number) => {
    for (const f of await listChildren(id)) {
      if (rows.length >= 1500) return;
      if (f.mimeType === FOLDER_MIME) { if (depth < 8 && !(mig.mode === "copy" && skipFolders.has(f.id))) await walk(f.id, `${path}/${f.name}`, depth + 1); continue; }
      const g = guessType(f.name, path);
      const restricted = isRestrictedEvidence(f.name, path);
      const supported = (SUPPORTED_MIME as readonly string[]).includes(f.mimeType) || f.mimeType === "application/vnd.google-apps.document";
      const m = g.category === "investor" ? match(g.investorName) : null;
      rows.push({
        migration_id: migrationId, drive_file_id: f.id, file_name: f.name, mime_type: f.mimeType, path: path || "/", size_bytes: f.size ? Number(f.size) : null,
        suggested_category: g.category, suggested_type: g.type, suggested_reason: restricted ? "Restricted evidence - never imported" : !supported ? "File type can't be imported" : g.reason,
        investor_name: g.investorName, category: g.category, document_type: g.type, profile_id: m?.profileId ?? null, onboarding_id: m?.onboardingId ?? null,
        action: restricted || !supported ? "blocked" : "pending",
      });
    }
  };
  try {
    await walk(mig.source_folder_id, "", 0);
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await db.from("drive_migration_items").upsert(rows.slice(i, i + 200), { onConflict: "migration_id,drive_file_id", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    }
    await db.from("drive_migrations").update({ status: "review", last_error: null, updated_at: new Date().toISOString() }).eq("id", migrationId);
    await event(migrationId, userId, "scanned", { files: rows.length });
  } catch (e) {
    await db.from("drive_migrations").update({ status: "failed", last_error: String((e as Error).message).slice(0, 500) }).eq("id", migrationId);
    throw e;
  }
}

// ---------------------------------------------------------------- read
export async function getMigration(userId: string, offeringId: string) {
  const canManage = await requireViewer(userId);
  const db = await admin();
  const { data: migs } = await db.from("drive_migrations").select("*").eq("offering_id", offeringId).order("created_at", { ascending: false }).limit(1);
  const mig = (migs ?? [])[0] ?? null;
  const { data: off } = await db.from("offerings").select("id, name, legal_entity_name").eq("id", offeringId).maybeSingle();
  if (!mig) return { canManage, fund: off, migration: null, items: [], suggestions: [], investors: [], summary: null };
  const [{ data: items }, { data: sugg }, { data: invs }] = await Promise.all([
    db.from("drive_migration_items").select("*").eq("migration_id", mig.id).order("path").order("file_name").limit(2000),
    db.from("drive_migration_suggestions").select("*").eq("migration_id", mig.id).order("created_at"),
    db.from("investor_onboardings").select("id, investment_profile_id").eq("offering_id", offeringId).is("removed_at", null),
  ]);
  const pIds = ((invs ?? []) as any[]).map((o) => o.investment_profile_id).filter(Boolean);
  const { data: profs } = pIds.length ? await db.from("investment_profiles").select("id, legal_name, display_label").in("id", pIds) : { data: [] };
  const investors = ((invs ?? []) as any[]).map((o) => {
    const p = ((profs ?? []) as any[]).find((x) => x.id === o.investment_profile_id);
    return { onboardingId: o.id, profileId: o.investment_profile_id, name: p?.display_label ?? p?.legal_name ?? "Investor" };
  });
  const it = (items ?? []) as any[];
  const sg = (sugg ?? []) as any[];
  const usable = it.filter((i) => i.action !== "blocked" && i.action !== "skip" && i.action !== "duplicate");
  const invSugg = sg.filter((s) => s.field === "investor");
  return {
    canManage, fund: off, migration: mig, investors,
    items: it.map((i) => ({ ...i, destination: destinationFor(i.category, i.document_type) })),
    suggestions: sg,
    summary: {
      files: it.length, sorted: usable.filter((i) => i.result === "done").length, toSort: usable.length,
      blocked: it.filter((i) => i.action === "blocked").length, held: it.filter((i) => i.result === "held").length,
      detailsReviewed: sg.filter((s) => s.field !== "investor" && s.status !== "open").length, details: sg.filter((s) => s.field !== "investor").length,
      investorsAdded: invSugg.filter((s) => s.status === "accepted").length, investors: invSugg.length,
    },
  };
}

// ---------------------------------------------------------------- review edits
export async function updateItems(userId: string, input: { ids: string[]; action?: "pending" | "accept" | "skip" | "duplicate"; category?: "fund" | "investor"; documentType?: string; onboardingId?: string | null }) {
  await requireManager(userId);
  const db = await admin();
  const { data: rows } = await db.from("drive_migration_items").select("id, action, result, migration_id").in("id", input.ids);
  const editable = ((rows ?? []) as any[]).filter((r) => r.action !== "blocked" && r.result !== "done").map((r) => r.id);
  if (!editable.length) return { updated: 0 };
  const patch: any = { updated_by: userId, updated_at: new Date().toISOString() };
  if (input.action) patch.action = input.action;
  if (input.category && input.documentType) {
    if (!(DOCUMENT_TYPES[input.category] as Record<string, string>)[input.documentType]) throw new Error("Choose a valid document type.");
    patch.category = input.category; patch.document_type = input.documentType;
  }
  if (input.onboardingId !== undefined) {
    if (input.onboardingId) {
      const { data: ob } = await db.from("investor_onboardings").select("id, investment_profile_id").eq("id", input.onboardingId).maybeSingle();
      if (!ob) throw new Error("Investor not found.");
      patch.onboarding_id = ob.id; patch.profile_id = ob.investment_profile_id;
    } else { patch.onboarding_id = null; patch.profile_id = null; }
  }
  const { error } = await db.from("drive_migration_items").update(patch).in("id", editable);
  if (error) throw new Error(error.message);
  await event(((rows ?? []) as any[])[0].migration_id, userId, "items_updated", { count: editable.length, ...patch, updated_by: undefined, updated_at: undefined });
  return { updated: editable.length };
}

/** AI sort for files the name rules couldn't place. Uses file names and folder paths only. */
export async function aiSort(userId: string, migrationId: string) {
  await requireManager(userId);
  const db = await admin();
  const { data } = await db.from("drive_migration_items").select("id, file_name, path").eq("migration_id", migrationId).eq("action", "pending").eq("suggested_type", "other_fund").limit(150);
  const rows = (data ?? []) as any[];
  if (!rows.length) return { sorted: 0 };
  const types = [...Object.keys(DOCUMENT_TYPES.fund).map((k) => `fund:${k}`), ...Object.keys(DOCUMENT_TYPES.investor).map((k) => `investor:${k}`)];
  const out = await ai({
    instructions: "You sort a private fund's Google Drive files into document types. Use only the file name and folder path. When unsure, use fund:other_fund. If an investor name is evident, return it, else null.",
    input: [{ role: "user", content: [{ type: "input_text", text: JSON.stringify(rows.map((r) => ({ id: r.id, name: r.file_name, path: r.path }))) }] }],
    schema: { type: "object", additionalProperties: false, required: ["items"], properties: { items: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "type", "investor"], properties: { id: { type: "string" }, type: { type: "string", enum: types }, investor: { type: ["string", "null"] } } } } } },
  });
  let n = 0;
  for (const r of (out?.items ?? []) as any[]) {
    if (!rows.some((x) => x.id === r.id) || r.type === "fund:other_fund") continue;
    const [category, type] = String(r.type).split(":");
    await db.from("drive_migration_items").update({ suggested_category: category, suggested_type: type, category, document_type: type, suggested_reason: "Sorted by AI from the name and folder", investor_name: r.investor ?? null }).eq("id", r.id);
    n++;
  }
  await event(migrationId, userId, "ai_sorted", { count: n });
  return { sorted: n };
}

// ---------------------------------------------------------------- apply
export async function applyBatch(userId: string, migrationId: string) {
  await requireManager(userId);
  const db = await admin();
  const d = await drive();
  const { data: mig } = await db.from("drive_migrations").select("*").eq("id", migrationId).single();
  const { data: rows } = await db.from("drive_migration_items").select("*").eq("migration_id", migrationId).eq("action", "accept").in("result", ["none", "failed", "held"]).limit(25);
  const batch = (rows ?? []) as any[];
  if (!batch.length) {
    await db.from("drive_migrations").update({ status: "done", updated_at: new Date().toISOString() }).eq("id", migrationId);
    return { processed: 0, remaining: 0 };
  }
  await db.from("drive_migrations").update({ status: "applying", updated_at: new Date().toISOString() }).eq("id", migrationId);
  const fundMap = await d.ensureFundStructure(mig.offering_id, { userId });
  const s = await import("@/lib/drive-intake.server");
  const { importOne } = await import("@/lib/drive-intake-core");
  const store = await s.supabaseIntakeStore(userId);
  const env = s.intakeEnvironment();
  for (const it of batch) {
    const done = async (result: "done" | "failed" | "held", msg: string | null, extra: Record<string, unknown> = {}) => {
      await db.from("drive_migration_items").update({ result, result_message: msg, updated_at: new Date().toISOString(), ...extra }).eq("id", it.id);
    };
    try {
      let dest: string | null = null;
      let repository: DriveRepository = env === "test" ? "test" : "fund";
      if (it.category === "investor") {
        if (!it.profile_id) { await done("held", "Choose the investor first (or add them from the suggestions)."); continue; }
        const im = await d.ensureInvestorStructure(mig.offering_id, it.profile_id, { userId }).catch((e: Error) => ({ status: "failed", last_error: e.message }) as any);
        if (im?.status !== "active") { await done("held", im?.last_error ?? "Investor Records drive isn't set up yet."); continue; }
        const sub = /subscription/.test(it.document_type ?? "") ? "01 - Subscription Documents" : /accredit/.test(it.document_type ?? "") ? "02 - Accreditation" : "03 - Approved Restricted Documents";
        dest = im.subfolders?.[sub] ?? im.folder_id;
        repository = env === "test" ? "test" : "investor";
      } else {
        if (fundMap?.status !== "active") throw new Error(fundMap?.last_error ?? "The fund folder isn't ready.");
        dest = fundMap.subfolders?.[destinationFor("fund", it.document_type)] ?? fundMap.folder_id;
      }
      // Move inside the Funds drive (link mode, fund files); otherwise copy and leave the original untouched.
      let target = it.target_file_id as string | null;
      if (!target) {
        const sameDrive = mig.mode === "link" && it.category === "fund";
        if (sameDrive) {
          const meta = await d.call(`/drive/v3/files/${encodeURIComponent(it.drive_file_id)}?supportsAllDrives=true&fields=parents`);
          const remove = ((meta.parents ?? []) as string[]).filter((p) => p !== dest).join(",");
          if (remove || !(meta.parents ?? []).includes(dest)) {
            await d.call(`/drive/v3/files/${encodeURIComponent(it.drive_file_id)}?supportsAllDrives=true&addParents=${encodeURIComponent(dest!)}${remove ? `&removeParents=${encodeURIComponent(remove)}` : ""}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}" });
          }
          target = it.drive_file_id;
        } else {
          const c = await d.call(`/drive/v3/files/${encodeURIComponent(it.drive_file_id)}/copy?supportsAllDrives=true&fields=id`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parents: [dest], name: safeName(it.file_name) }),
          });
          target = c.id;
        }
        await db.from("drive_migration_items").update({ target_file_id: target }).eq("id", it.id);
        await event(migrationId, userId, sameDrive ? "file_moved" : "file_copied", { file: it.drive_file_id, target, dest });
      }
      const executed = /executed/.test(it.document_type ?? "");
      const res = await importOne({
        driveFileId: target!, repository, offeringId: mig.offering_id, profileId: it.profile_id ?? null, onboardingId: it.onboarding_id ?? null,
        category: it.category, documentType: it.document_type,
        classification: it.category === "fund" ? "fund_general" : classifyDocument(it.document_type, it.file_name),
        recordStatus: "historical", historicalExecuted: executed, description: `Migrated from Drive: ${it.path}/${it.file_name}`.slice(0, 500),
      } as any, { env, config: d.repositoryConfig(), userId, drive: s.gatewayRead, store });
      if (res.ok) await done("done", null, { document_id: res.documentId });
      else if (res.outcome === "already_imported") await done("done", "Already on the platform", { document_id: res.existingDocumentId ?? null });
      else await done("failed", res.message);
    } catch (e) {
      await done("failed", String((e as Error).message).slice(0, 400));
    }
  }
  const { count } = await db.from("drive_migration_items").select("id", { count: "exact", head: true }).eq("migration_id", migrationId).eq("action", "accept").eq("result", "none");
  await event(migrationId, userId, "applied_batch", { processed: batch.length });
  return { processed: batch.length, remaining: count ?? 0 };
}

// ---------------------------------------------------------------- AI read of key documents
async function ai(body: { instructions: string; input: any; schema: Record<string, unknown> }) {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI isn't configured.");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "openai/gpt-6-astra", reasoning: { effort: "low" }, instructions: body.instructions, input: body.input, text: { format: { type: "json_schema", name: "result", strict: true, schema: body.schema } } }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    console.error("drive migration AI failed", res.status, t);
    if (res.status === 429) throw new Error("The AI helper is busy. Try again in a minute.");
    if (res.status === 402) throw new Error("AI credits have run out. Add credits in Settings → Plans & credits.");
    throw new Error(`AI request failed [${res.status}].`);
  }
  const j: any = await res.json();
  const text = String(j?.output_text ?? (j?.output ?? []).flatMap((o: any) => o?.content ?? []).filter((c: any) => c?.type === "output_text").map((c: any) => c.text).join(""));
  try { return JSON.parse(text); } catch { return null; }
}

const KEY_TYPES = ["operating_agreement", "formation", "subscription_agreement", "executed_subscription_agreement", "regulatory_filing"];
const VAL = (t: string) => ({ type: ["object", "null"], additionalProperties: false, required: ["value", "page"], properties: { value: { type: t }, page: { type: ["integer", "null"] } } });

/** Reads the next unread key document and stores suggestions. One document per call. */
export async function extractNext(userId: string, migrationId: string) {
  await requireManager(userId);
  const db = await admin();
  const { data: mig } = await db.from("drive_migrations").select("*").eq("id", migrationId).single();
  const { data: evs } = await db.from("drive_migration_events").select("detail").eq("migration_id", migrationId).eq("kind", "document_read");
  const read = new Set(((evs ?? []) as any[]).map((e) => e.detail?.item_id));
  const { data: cands } = await db.from("drive_migration_items").select("*").eq("migration_id", migrationId).in("document_type", KEY_TYPES).neq("action", "blocked").neq("action", "skip").limit(500);
  const next = ((cands ?? []) as any[]).filter((c) => !read.has(c.id)).sort((a, b) => KEY_TYPES.indexOf(a.document_type) - KEY_TYPES.indexOf(b.document_type))[0];
  const remaining = ((cands ?? []) as any[]).filter((c) => !read.has(c.id)).length;
  if (!next) return { read: null, remaining: 0, added: 0 };
  await event(migrationId, userId, "document_read", { item_id: next.id });
  const isPdf = next.mime_type === "application/pdf" || next.mime_type === "application/vnd.google-apps.document";
  if (!isPdf || (next.size_bytes ?? 0) > 15_000_000) return { read: next.file_name, remaining: remaining - 1, added: 0, note: "Only PDFs and Google Docs under 15 MB are read." };
  const d = await drive();
  const path = next.mime_type === "application/vnd.google-apps.document"
    ? `/drive/v3/files/${encodeURIComponent(next.drive_file_id)}/export?mimeType=application%2Fpdf`
    : `/drive/v3/files/${encodeURIComponent(next.drive_file_id)}?alt=media&supportsAllDrives=true`;
  const r = await fetch(`${d.GATEWAY}${path}`, { headers: d.headers() });
  if (!r.ok) return { read: next.file_name, remaining: remaining - 1, added: 0, note: `Couldn't download (${r.status}).` };
  const b64 = Buffer.from(await r.arrayBuffer()).toString("base64");
  const out = await ai({
    instructions: "Extract facts about the private fund from this document. Only report values literally stated in the document, with the 1-based page number. Use null when a value isn't stated. Never guess. EIN format NN-NNNNNNN. Dates YYYY-MM-DD. Percentages as numbers (2 for 2%). Commitment amounts in US dollars.",
    input: [{ role: "user", content: [{ type: "input_file", filename: `${safeName(next.file_name)}.pdf`, file_data: `data:application/pdf;base64,${b64}` }, { type: "input_text", text: `File: ${next.file_name}. Type: ${next.document_type}.` }] }],
    schema: {
      type: "object", additionalProperties: false,
      required: ["legal_name", "entity_type", "jurisdiction", "formation_date", "fiscal_year_end", "ein", "management_fee_percent", "carried_interest_percent", "investors"],
      properties: {
        legal_name: VAL("string"), entity_type: VAL("string"), jurisdiction: VAL("string"), formation_date: VAL("string"), fiscal_year_end: VAL("string"), ein: VAL("string"),
        management_fee_percent: VAL("number"), carried_interest_percent: VAL("number"),
        investors: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "email", "commitment_usd", "page"], properties: { name: { type: "string" }, email: { type: ["string", "null"] }, commitment_usd: { type: ["number", "null"] }, page: { type: ["integer", "null"] } } } },
      },
    },
  });
  if (!out) return { read: next.file_name, remaining: remaining - 1, added: 0 };
  const { data: o } = await db.from("offerings").select("legal_entity_name, entity_type, state_formed, date_formed").eq("id", mig.offering_id).maybeSingle();
  const current: Record<string, unknown> = { legal_name: o?.legal_entity_name, entity_type: o?.entity_type, jurisdiction: o?.state_formed, formation_date: o?.date_formed };
  const { data: existing } = await db.from("drive_migration_suggestions").select("field, proposed").eq("migration_id", migrationId);
  const seen = new Set(((existing ?? []) as any[]).map((s) => `${s.field}:${JSON.stringify(s.proposed)}`));
  const add: any[] = [];
  for (const f of ["legal_name", "entity_type", "jurisdiction", "formation_date", "fiscal_year_end", "ein", "management_fee_percent", "carried_interest_percent"]) {
    const v = out[f];
    if (!v || v.value === null || v.value === "" || v.value === undefined) continue;
    if (current[f] !== undefined && current[f] !== null && String(current[f]).toLowerCase() === String(v.value).toLowerCase()) continue;
    if (seen.has(`${f}:${JSON.stringify(v.value)}`)) continue;
    seen.add(`${f}:${JSON.stringify(v.value)}`);
    add.push({ migration_id: migrationId, item_id: next.id, field: f, proposed: v.value, current_value: f === "ein" ? null : (current[f] ?? null), source_file_name: next.file_name, source_page: v.page ?? null });
  }
  for (const inv of (out.investors ?? []) as any[]) {
    if (!inv?.name) continue;
    const val = { name: inv.name, email: inv.email ?? null, commitment_usd: inv.commitment_usd ?? null };
    if ([...seen].some((k) => k.startsWith("investor:") && k.toLowerCase().includes(`"name":"${String(inv.name).toLowerCase()}"`))) continue;
    seen.add(`investor:${JSON.stringify(val)}`);
    add.push({ migration_id: migrationId, item_id: next.id, field: "investor", proposed: val, source_file_name: next.file_name, source_page: inv.page ?? null });
  }
  if (add.length) await db.from("drive_migration_suggestions").insert(add);
  return { read: next.file_name, remaining: remaining - 1, added: add.length };
}

// ---------------------------------------------------------------- decide suggestion
export async function decideSuggestion(userId: string, userClient: any, input: { id: string; accept: boolean; note?: string | null | undefined; investorType?: string | null | undefined; email?: string | null | undefined }) {
  await requireManager(userId);
  const db = await admin();
  const { data: s } = await db.from("drive_migration_suggestions").select("*, drive_migrations(offering_id)").eq("id", input.id).maybeSingle();
  if (!s || s.status !== "open") throw new Error("That suggestion was already decided.");
  const offeringId = s.drive_migrations.offering_id as string;
  const finish = async (status: string, note: string | null) => {
    await db.from("drive_migration_suggestions").update({ status, decided_by: userId, decided_at: new Date().toISOString(), decision_note: note }).eq("id", s.id).eq("status", "open");
    await event(s.migration_id, userId, `suggestion_${status}`, { field: s.field, note });
  };
  if (!input.accept) { await finish("rejected", input.note ?? null); return { ok: true }; }
  const v = s.proposed;
  const c = await import("@/lib/fund-setup-canonical.server");
  try {
    if (s.field === "legal_name") await c.changeLegalName(userId, { offeringId, legalName: String(v), reason: `From ${s.source_file_name ?? "migrated document"}` });
    else if (s.field === "entity_type") await c.saveFundSetupFields(userId, { offeringId, fields: { entityType: String(v) } });
    else if (s.field === "jurisdiction") await c.saveFundSetupFields(userId, { offeringId, fields: { jurisdiction: String(v) } });
    else if (s.field === "formation_date") await c.saveFundSetupFields(userId, { offeringId, fields: { formationDate: String(v) } });
    else if (s.field === "fiscal_year_end") await c.saveFundSetupFields(userId, { offeringId, fields: {}, setupFields: { fiscalYearEnd: String(v) } });
    else if (s.field === "ein") {
      const { data: det } = await userClient.rpc("get_offering_entity_details", { p_offering_id: offeringId }).maybeSingle();
      if ((det as any)?.has_ein && (det as any)?.ein) throw new Error("This fund already has an EIN. Change it on the Entity tab if it's wrong.");
      const digits = String(v).replace(/\D/g, "");
      if (digits.length !== 9) throw new Error("That EIN isn't 9 digits.");
      const { responsible_party_tin: _a, responsible_party_tin_last4: _b, ...ss4 } = ((det as any)?.ss4 ?? {}) as any;
      const { error } = await userClient.rpc("save_offering_entity_details", { p_offering_id: offeringId, p_has_ein: true, p_ein: `${digits.slice(0, 2)}-${digits.slice(2)}`, p_ss4: ss4 });
      if (error) throw new Error(error.message);
    } else if (s.field === "management_fee_percent" || s.field === "carried_interest_percent") {
      const { data: setup } = await db.from("fund_setups").select("id").eq("offering_id", offeringId).maybeSingle();
      const { data: vers } = setup ? await db.from("fund_economics_versions").select("*").eq("setup_id", setup.id).order("version", { ascending: false }).limit(1) : { data: [] };
      const last: any = (vers ?? [])[0] ?? {};
      const terms: any = { managementFee: null, carry: null, ...(last.terms ?? {}) };
      if (s.field === "management_fee_percent") terms.managementFee = { basis: null, frequency: null, ...(terms.managementFee ?? {}), ratePercent: Number(v) };
      else terms.carry = { ...(terms.carry ?? {}), ratePercent: Number(v) };
      await c.saveFundEconomics(userId, { offeringId, terms, classes: (last.classes ?? []) as any, changeReason: `From ${s.source_file_name ?? "migrated document"}` });
    } else if (s.field === "investor") {
      const r = await import("@/lib/investor-record.server");
      const parts = String(v.name).trim().split(/\s+/);
      const trust = /\btrust\b/i.test(String(v.name));
      const entity = trust || /\b(llc|lp|l\.p\.|inc|corp|fund|partners|holdings|ltd|capital|ventures)\b/i.test(String(v.name));
      const email = (input.email || v.email || "").trim();
      if (!email) throw new Error("Add the investor's email before accepting.");
      const cents = v.commitment_usd ? Math.round(Number(v.commitment_usd) * 100) : null;
      await r.createInvestor(userId, {
        offeringId,
        person: { firstName: entity ? "Authorized" : parts[0], lastName: entity ? "Signer" : parts.slice(1).join(" ") || parts[0], email },
        profile: { type: input.investorType || (trust ? "trust" : entity ? "entity" : "individual"), ...(entity && !trust ? { subType: "other_entity" } : {}), legalName: String(v.name) },
        investment: { amountCents: cents, commitmentCents: cents },
      });
    } else throw new Error("Unknown suggestion.");
  } catch (e) {
    throw new Error((e as Error).message);
  }
  await finish("accepted", input.note ?? null);
  if (s.field === "investor") await linkItemsToNewInvestor(s.migration_id, offeringId, String(v.name));
  return { ok: true };
}

async function linkItemsToNewInvestor(migrationId: string, offeringId: string, name: string) {
  const db = await admin();
  const { data: profs } = await db.from("investment_profiles").select("id, legal_name").ilike("legal_name", name).limit(5);
  for (const p of (profs ?? []) as any[]) {
    const { data: ob } = await db.from("investor_onboardings").select("id").eq("offering_id", offeringId).eq("investment_profile_id", p.id).is("removed_at", null).maybeSingle();
    if (!ob) continue;
    await db.from("drive_migration_items").update({ profile_id: p.id, onboarding_id: ob.id }).eq("migration_id", migrationId).eq("category", "investor").is("profile_id", null).ilike("investor_name", name);
  }
}

export async function migrationOverview(userId: string, offeringId: string) {
  const r = await getMigration(userId, offeringId);
  return { migration: r.migration ? { id: r.migration.id, status: r.migration.status, source: r.migration.source_folder_name, mode: r.migration.mode } : null, summary: r.summary };
}
