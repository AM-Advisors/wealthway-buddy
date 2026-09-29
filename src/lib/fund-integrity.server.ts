import { canUseDriveIntake } from "@/lib/drive-intake";
/**
 * Fund & Investor Record Integrity (server-only).
 *
 * Sync Investor Records is reconciliation, not import: it reads canonical
 * Person → Profile → Investment records and (when the restricted repository
 * passes its safety check) lists Drive folders GET-only. It never creates a
 * Fund, Person, Profile or Investment by itself, never overwrites data, never
 * deletes or merges folders, never grants app or Drive access, and never sends
 * email. Every non-exact finding becomes an idempotent review item that
 * Harmonious resolves one at a time through the existing canonical services.
 */
import {
  actionsFor, classifyFolder, findFundMatches, looseFundKey, normalizeFundName, parseInvestorFolderName, queueKindFor,
  summarize, syncItemKey, syncProtected, SYNC_CATEGORIES,
  type CanonicalInvestment, type FundRef, type PersonHit, type SyncAction, type SyncCategory,
} from "@/lib/fund-integrity";

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
const nowIso = () => new Date().toISOString();
const FOLDER_MIME = "application/vnd.google-apps.folder";

export async function requireStaff(context: any): Promise<string> {
  const { data } = await context.supabase.rpc("is_any_staff");
  if (data !== true) throw new Error("Forbidden: Harmonious staff only.");
  return context.userId as string;
}

async function isSuperAdmin(context: any): Promise<boolean> {
  const { data } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
  return canUseDriveIntake((data ?? []).map((r: any) => String(r.role)));
}

async function audit(offeringId: string | null, itemId: string | null, event: string, actorId: string | null, detail: Record<string, unknown> = {}) {
  const db = await admin();
  // Categories and ids only — never names, paths, identifiers or document contents.
  await db.from("fund_record_sync_events").insert({ offering_id: offeringId, item_id: itemId, event, detail, actor_id: actorId });
}

/* ----------------------------------------------------------------- funds */

async function allFunds(): Promise<FundRef[]> {
  const db = await admin();
  const { data } = await db.from("offerings").select("id,name,legal_entity_name").is("consolidated_into", null).limit(5000);
  return ((data ?? []) as any[]).map((f) => ({ id: f.id, name: f.name, legalName: f.legal_entity_name }));
}

export async function searchFunds(context: any, input: { name?: string | null | undefined; legalName?: string | null | undefined; excludeId?: string | null | undefined }) {
  await requireStaff(context);
  const matches = findFundMatches(input, await allFunds(), input.excludeId ?? null);
  return { matches: matches.slice(0, 10) };
}

/** Pre-insert check used by fund creation. Throws with the existing Fund's id so the UI can open it. */
export async function assertFundIdentityFree(input: { name: string; legalName?: string | null | undefined; excludeId?: string | null | undefined; distinctConfirmed?: boolean | undefined }, actorId: string | null) {
  const matches = findFundMatches(input, await allFunds(), input.excludeId ?? null);
  const same = matches.find((m) => m.kind === "same_name" || m.kind === "same_legal_name");
  if (same) {
    await audit(same.id, null, "fund_duplicate_prevented", actorId, { kind: same.kind });
    throw new Error(`EXISTING_FUND:${same.id}:${same.kind === "same_name" ? `A Fund named "${same.name}" already exists.` : `That Legal Name already belongs to "${same.name}".`} Open the existing Fund instead.`);
  }
  const { data: history } = await (await admin()).from("offering_name_history").select("offering_id,previous_name").limit(5000);
  const { historicalNameCollision, HISTORICAL_NAME_MESSAGE } = await import("@/lib/fund-duplicate-resolution");
  const prior = historicalNameCollision(input.name, ((history ?? []) as any[]).map((h) => ({ offeringId: h.offering_id, previousName: h.previous_name })), input.excludeId ?? null);
  if (prior) {
    await audit(prior.offeringId, null, "fund_historical_name_collision", actorId, {});
    throw new Error(`EXISTING_FUND:${prior.offeringId}:${HISTORICAL_NAME_MESSAGE} Harmonious review is required before using it.`);
  }
  if (!input.distinctConfirmed && matches.some((m) => m.kind === "similar")) {
    throw new Error("SIMILAR_FUND:A similar Fund already exists. Open it, add an offering to it, or confirm this is a genuinely distinct Fund.");
  }
}

/** Existing duplicate Funds (created before uniqueness was enforced) become review items. */
async function fundDuplicateItems(runId: string | null, actorId: string | null) {
  const funds = await allFunds();
  const groups = new Map<string, FundRef[]>();
  for (const f of funds) {
    const k = normalizeFundName(f.name);
    if (!k) continue;
    groups.set(k, [...(groups.get(k) ?? []), f]);
  }
  const keys: string[] = [];
  for (const [k, list] of groups) {
    if (list.length < 2) continue;
    const ids = list.map((f) => f.id).sort();
    const key = `fund-dup:${ids.join(":")}`;
    keys.push(key);
    await upsertItem({ offeringId: ids[0]!, key, category: "fund_duplicate", confidence: "duplicate", title: `Fund Duplicate Review — ${list[0]!.name}`, detail: { fundIds: ids, nameKey: k }, runId, actorId });
  }
  return keys.length;
}

/* ------------------------------------------------------------- sync items */

type ItemInput = {
  offeringId: string | null; key: string; category: SyncCategory; confidence: string | null; title: string;
  detail?: Record<string, unknown>; sourceRef?: string | null; onboardingId?: string | null; profileId?: string | null;
  personId?: string | null; runId: string | null; actorId: string | null; resolvedAsMatch?: boolean;
};

/** Idempotent: the same finding always lands on the same row; resolved rows stay resolved. */
async function upsertItem(i: ItemInput): Promise<{ id: string; created: boolean }> {
  const db = await admin();
  const { data: existing } = await db.from("fund_record_sync_items").select("id,status").eq("item_key", i.key).maybeSingle();
  const base = {
    offering_id: i.offeringId, category: i.category, confidence: i.confidence, queue_kind: queueKindFor(i.category), title: i.title.slice(0, 300),
    detail: i.detail ?? {}, source_ref: i.sourceRef ?? null, onboarding_id: i.onboardingId ?? null, investment_profile_id: i.profileId ?? null,
    person_id: i.personId ?? null, last_seen_at: nowIso(), last_run_id: i.runId,
  };
  if (existing) {
    await db.from("fund_record_sync_items").update(base).eq("id", existing.id);
    return { id: existing.id, created: false };
  }
  const row = i.resolvedAsMatch
    ? { ...base, item_key: i.key, status: "resolved", resolution: "exact_match", resolved_at: nowIso() }
    : { ...base, item_key: i.key, status: "open" };
  const { data, error } = await db.from("fund_record_sync_items").insert(row).select("id").single();
  if (error) {
    // A concurrent run inserted the same key first — converge on it.
    const { data: again } = await db.from("fund_record_sync_items").select("id").eq("item_key", i.key).maybeSingle();
    if (again) return { id: again.id, created: false };
    throw new Error(error.message);
  }
  return { id: data.id, created: true };
}

async function canonicalInvestments(offeringId: string): Promise<CanonicalInvestment[]> {
  const db = await admin();
  const { data: obs } = await db.from("investor_onboardings")
    .select("id,investment_profile_id,person_id,stage,removed_at").eq("offering_id", offeringId).limit(2000);
  const profileIds = [...new Set((obs ?? []).map((o: any) => o.investment_profile_id).filter(Boolean))];
  const personIds = [...new Set((obs ?? []).map((o: any) => o.person_id).filter(Boolean))];
  const [{ data: profiles }, { data: people }] = await Promise.all([
    profileIds.length ? db.from("investment_profiles").select("id,legal_name,display_label,profile_type,person_id").in("id", profileIds) : { data: [] },
    personIds.length ? db.from("persons").select("id,legal_first_name,legal_last_name").in("id", personIds) : { data: [] },
  ]);
  return ((obs ?? []) as any[]).map((o) => {
    const p = (profiles ?? []).find((x: any) => x.id === o.investment_profile_id);
    const pe = (people ?? []).find((x: any) => x.id === (o.person_id ?? p?.person_id));
    return {
      onboardingId: o.id, profileId: o.investment_profile_id ?? null, personId: o.person_id ?? p?.person_id ?? null,
      profileName: p?.legal_name ?? p?.display_label ?? null, profileType: p?.profile_type ?? null,
      personName: pe ? `${pe.legal_first_name ?? ""} ${pe.legal_last_name ?? ""}`.trim() : null,
      stage: o.stage ?? null, removed: Boolean(o.removed_at) || ["declined", "cancelled"].includes(String(o.stage)),
    };
  });
}

/** People elsewhere on the platform who plausibly match a folder name. Staff-only; ids only. */
async function personHitsFor(displayName: string, excludePersonIds: Set<string>): Promise<PersonHit[]> {
  const db = await admin();
  const ids = new Map<string, Set<string>>();
  const add = (pid: string | null, prof: string | null) => {
    if (!pid || excludePersonIds.has(pid)) return;
    if (!ids.has(pid)) ids.set(pid, new Set());
    if (prof) ids.get(pid)!.add(prof);
  };
  const clean = displayName.trim();
  if (clean.length < 3) return [];
  const { data: profs } = await db.from("investment_profiles").select("id,person_id").ilike("legal_name", clean).not("person_id", "is", null).limit(10);
  (profs ?? []).forEach((p: any) => add(p.person_id, p.id));
  if (clean.includes(" ")) {
    const first = clean.split(/\s+/)[0]!, last = clean.slice(clean.indexOf(" ") + 1);
    const { data: ppl } = await db.from("persons").select("id").ilike("legal_first_name", first).ilike("legal_last_name", last).limit(10);
    (ppl ?? []).forEach((p: any) => add(p.id, null));
  }
  return [...ids.entries()].map(([personId, s]) => ({ personId, profileIds: [...s] }));
}

type DriveListing = { checked: boolean; note: string | null; folders: { id: string; name: string; tagKey: string | null; files: { id: string; name: string; mimeType: string }[] }[] };

async function listInvestorFolders(context: any, offeringId: string): Promise<DriveListing> {
  if (!(await isSuperAdmin(context))) return { checked: false, note: "Drive folders are examined only when a Super Administrator runs the sync.", folders: [] };
  try {
    const s = await import("@/lib/drive-intake.server");
    const d = await import("@/lib/drive.server");
    const env = s.intakeEnvironment();
    const repoKey = env === "test" ? "test" : "investor";
    if (!(d.repositoryConfig() as any)[repoKey]) return { checked: false, note: "The Restricted Investor Records repository is not configured.", folders: [] };
    const problems = await d.investorRepositoryProblems(env);
    if (problems.length) return { checked: false, note: "The Restricted Investor Records safety check did not pass, so Drive was not read.", folders: [] };
    const { investorFundKey } = await import("@/lib/drive-structure");
    const db = await admin();
    const { data: fundMap } = await db.from("drive_folder_mappings").select("folder_id,subfolders,status").eq("harmonious_key", investorFundKey(offeringId)).maybeSingle();
    const investorsFolder = fundMap?.subfolders?.["Investors"] ?? null;
    if (!investorsFolder) return { checked: false, note: "This Fund has no linked Restricted Investor Records folder yet.", folders: [] };
    const children = ((await s.gatewayRead.children(investorsFolder)) as any[]).filter((c) => c.mimeType === FOLDER_MIME);
    const folders: DriveListing["folders"] = [];
    for (const c of children.slice(0, 200)) {
      const inner = ((await s.gatewayRead.children(c.id).catch(() => [])) as any[]);
      const files: { id: string; name: string; mimeType: string }[] = [];
      for (const f of inner) {
        if (f.mimeType === FOLDER_MIME) {
          const deeper = ((await s.gatewayRead.children(f.id).catch(() => [])) as any[]).filter((x) => x.mimeType !== FOLDER_MIME);
          files.push(...deeper.map((x) => ({ id: x.id, name: x.name, mimeType: x.mimeType })));
        } else files.push({ id: f.id, name: f.name, mimeType: f.mimeType });
      }
      folders.push({ id: c.id, name: c.name, tagKey: c.appProperties?.harmonious_key ?? null, files: files.slice(0, 200) });
    }
    return { checked: true, note: null, folders };
  } catch {
    return { checked: false, note: "Google Drive could not be read right now; canonical checks still ran.", folders: [] };
  }
}

/** Preview: classify everything, persist idempotent review items, change no canonical record. */
export async function runInvestorRecordsSync(context: any, offeringId: string) {
  const actorId = await requireStaff(context);
  const db = await admin();
  const { data: fund } = await db.from("offerings").select("id,name").eq("id", offeringId).maybeSingle();
  if (!fund) throw new Error("Fund not found.");
  const { data: run } = await db.from("fund_record_sync_runs").insert({ offering_id: offeringId, actor_id: actorId }).select("id").single();
  const runId = run?.id ?? null;

  const investments = await canonicalInvestments(offeringId);
  const { data: mappings } = await db.from("drive_folder_mappings").select("folder_id,investment_profile_id,status,harmonious_key").eq("offering_id", offeringId).eq("entity_kind", "investor");
  const linkedByFolder = new Map<string, string>(((mappings ?? []) as any[]).filter((m) => m.folder_id && m.investment_profile_id).map((m) => [m.folder_id, m.investment_profile_id]));
  const listing = await listInvestorFolders(context, offeringId);
  const { isBlockedFromInvestorDrive } = await import("@/lib/investor-drive");

  const inFundPersons = new Set(investments.map((i) => i.personId).filter(Boolean) as string[]);
  const profileFolders = new Map<string, string[]>();

  for (const f of listing.folders) {
    const tagProfile = f.tagKey?.startsWith(`investor:${offeringId}:`) ? f.tagKey.split(":")[2] ?? null : null;
    const linkedProfileId = linkedByFolder.get(f.id) ?? tagProfile;
    const { displayName } = parseInvestorFolderName(f.name);
    const hits = linkedProfileId ? [] : await personHitsFor(displayName, inFundPersons);
    const c = classifyFolder({ name: f.name, linkedProfileId }, investments, hits);
    const ref = `folder:${f.id}`;
    const detail: Record<string, unknown> = { folderId: f.id, folderName: f.name.slice(0, 200) };

    if (c.category === "matched" && c.confidence === "exact") {
      profileFolders.set(c.profileId ?? "", [...(profileFolders.get(c.profileId ?? "") ?? []), f.id]);
      const inv = investments.find((i) => i.onboardingId === c.onboardingId)!;
      await upsertItem({ offeringId, key: syncItemKey(offeringId, "matched", ref), category: "matched", confidence: "exact", title: `Matched — ${f.name}`, detail, sourceRef: f.id, onboardingId: c.onboardingId, profileId: c.profileId, personId: inv.personId, runId, actorId, resolvedAsMatch: true });
      // Entity/display-name drift becomes a Suggested Update — never an overwrite.
      if (inv.profileName && normalizeFundName(displayName) && normalizeFundName(displayName) !== normalizeFundName(inv.profileName)) {
        await upsertItem({ offeringId, key: syncItemKey(offeringId, "suggested_update", `${ref}:name`), category: "suggested_update", confidence: "exact", title: `Suggested Update — folder name differs from the investing profile`, detail: { ...detail, field: "legal_name", protected: syncProtected(inv.stage) }, sourceRef: f.id, onboardingId: inv.onboardingId, profileId: inv.profileId, runId, actorId });
      }
    } else if (c.category === "matched" || c.category === "conflict") {
      await upsertItem({ offeringId, key: syncItemKey(offeringId, c.category === "conflict" ? "conflict" : "unmatched_folder", ref), category: c.category === "conflict" ? "conflict" : "unmatched_folder", confidence: c.category === "conflict" ? "conflict" : "likely", title: `${c.category === "conflict" ? "Conflict" : "Likely Match — Review Required"} — ${f.name}`, detail: { ...detail, candidateOnboardingIds: c.onboardingIds }, sourceRef: f.id, onboardingId: c.onboardingIds.length === 1 ? c.onboardingIds[0]! : null, runId, actorId });
    } else if (c.category === "removed_investor") {
      await upsertItem({ offeringId, key: syncItemKey(offeringId, "removed_investor", ref), category: "removed_investor", confidence: "none", title: `Folder for a removed investor — ${f.name}`, detail, sourceRef: f.id, onboardingId: c.onboardingId, runId, actorId });
    } else if (c.category === "existing_person_missing_investment") {
      await upsertItem({ offeringId, key: syncItemKey(offeringId, "existing_person_missing_investment", ref), category: "existing_person_missing_investment", confidence: "likely", title: `Existing Investor — Add to This Fund? — ${f.name}`, detail, sourceRef: f.id, personId: c.personIds[0]!, runId, actorId });
    } else if (c.category === "duplicate_candidate") {
      await upsertItem({ offeringId, key: syncItemKey(offeringId, "duplicate_candidate", ref), category: "duplicate_candidate", confidence: "duplicate", title: `Duplicate Candidate — ${f.name}`, detail: { ...detail, candidatePersonCount: c.personIds.length }, sourceRef: f.id, runId, actorId });
    } else {
      await upsertItem({ offeringId, key: syncItemKey(offeringId, "new_investor_candidate", ref), category: "new_investor_candidate", confidence: "none", title: `No Match — ${f.name}`, detail, sourceRef: f.id, runId, actorId });
    }

    // Documents inside the folder: never imported by sync, never "signed" because a PDF exists.
    const fileIds = f.files.map((x) => x.id);
    const { data: imported } = fileIds.length ? await db.from("drive_imported_documents").select("drive_file_id").in("drive_file_id", fileIds) : { data: [] };
    const known = new Set((imported ?? []).map((r: any) => r.drive_file_id));
    for (const file of f.files) {
      if (isBlockedFromInvestorDrive(file.name)) {
        await upsertItem({ offeringId, key: syncItemKey(offeringId, "restricted_document", `file:${file.id}`), category: "restricted_document", confidence: null, title: "Restricted Document Review Required", detail: { folderId: f.id, fileId: file.id }, sourceRef: file.id, runId, actorId });
      } else if (!known.has(file.id)) {
        await upsertItem({ offeringId, key: syncItemKey(offeringId, "historical_document", `file:${file.id}`), category: "historical_document", confidence: null, title: `Historical / Imported — ${file.name.slice(0, 120)}`, detail: { folderId: f.id, fileId: file.id, executionEvidence: "none" }, sourceRef: file.id, runId, actorId });
      }
    }
  }

  // Duplicate folders for one Investment Profile.
  for (const [profileId, folders] of profileFolders) {
    if (profileId && folders.length > 1) {
      await upsertItem({ offeringId, key: syncItemKey(offeringId, "duplicate_candidate", `profile:${profileId}`), category: "duplicate_candidate", confidence: "duplicate", title: "Possible Duplicate Investor Folders", detail: { folderIds: folders }, profileId, runId, actorId });
    }
  }

  // Reverse check: canonical Investments with no investor records folder.
  const mappedProfiles = new Set(((mappings ?? []) as any[]).filter((m) => m.folder_id && m.status !== "archived").map((m) => m.investment_profile_id));
  for (const inv of investments) {
    if (inv.removed || !inv.profileId || mappedProfiles.has(inv.profileId)) continue;
    await upsertItem({ offeringId, key: syncItemKey(offeringId, "missing_folder", `profile:${inv.profileId}`), category: "missing_folder", confidence: null, title: `Investor Records Folder Missing — ${inv.profileName ?? "Investor"}`, detail: {}, onboardingId: inv.onboardingId, profileId: inv.profileId, personId: inv.personId, runId, actorId });
  }

  // Duplicate Funds on the platform whose name normalizes like this one.
  const funds = await allFunds();
  const twins = funds.filter((f) => f.id !== offeringId && (normalizeFundName(f.name) === normalizeFundName(fund.name) || (looseFundKey(fund.name).length >= 4 && looseFundKey(f.name) === looseFundKey(fund.name))));
  if (twins.length) {
    const ids = [offeringId, ...twins.map((t) => t.id)].sort();
    await upsertItem({ offeringId, key: `fund-dup:${ids.join(":")}`, category: "fund_duplicate", confidence: "duplicate", title: `Fund Duplicate Review — ${fund.name}`, detail: { fundIds: ids }, runId, actorId });
  }

  const status = await syncStatus(context, offeringId, true);
  await db.from("fund_record_sync_runs").update({ drive_checked: listing.checked, drive_note: listing.note, counts: status.summary }).eq("id", runId);
  await audit(offeringId, null, "sync_run", actorId, { driveChecked: listing.checked, folders: listing.folders.length, ...status.summary });
  return status;
}

export async function syncStatus(context: any, offeringId: string, skipGate = false) {
  if (!skipGate) await requireStaff(context);
  const db = await admin();
  const [{ data: items }, { data: lastRun }] = await Promise.all([
    db.from("fund_record_sync_items").select("id,category,confidence,queue_kind,title,detail,status,resolution,onboarding_id,investment_profile_id,person_id,first_seen_at,last_seen_at").eq("offering_id", offeringId).order("first_seen_at", { ascending: true }).limit(1000),
    db.from("fund_record_sync_runs").select("created_at,drive_checked,drive_note").eq("offering_id", offeringId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const list = ((items ?? []) as any[]).map((i) => ({
    id: i.id as string, category: i.category as SyncCategory, categoryLabel: SYNC_CATEGORIES[i.category as SyncCategory] ?? i.category,
    confidence: i.confidence as string | null, title: i.title as string, status: i.status as string, resolution: i.resolution as string | null,
    onboardingId: i.onboarding_id as string | null, profileId: i.investment_profile_id as string | null, personId: i.person_id as string | null,
    protected: Boolean(i.detail?.protected), actions: i.status === "resolved" || i.status === "dismissed" ? [] : actionsFor(i.category as SyncCategory),
  }));
  return {
    lastCheckedAt: (lastRun?.created_at as string) ?? null,
    driveChecked: Boolean(lastRun?.drive_checked),
    driveNote: (lastRun?.drive_note as string) ?? null,
    summary: summarize(list),
    items: list,
  };
}

/* ------------------------------------------------------------- resolution */

export type ResolveInput = {
  itemId: string; action: SyncAction; note?: string | null;
  onboardingId?: string | null; profileId?: string | null; personId?: string | null;
  person?: { firstName: string; lastName: string; email: string } | null; profileType?: string | null; amountCents?: number | null;
};

/** Claims one item atomically so two staff members can never act on it twice. */
export async function resolveSyncItem(context: any, input: ResolveInput) {
  const actorId = await requireStaff(context);
  const db = await admin();
  const { data: claimed } = await db.from("fund_record_sync_items").update({ status: "in_progress" })
    .eq("id", input.itemId).in("status", ["open", "later"]).select("*").maybeSingle();
  if (!claimed) throw new Error("This item was already resolved or is being handled by someone else.");
  const item = claimed as any;
  const offeringId = item.offering_id as string;
  const release = async () => { await db.from("fund_record_sync_items").update({ status: "open" }).eq("id", item.id).eq("status", "in_progress"); };
  const finish = async (resolution: string, patch: Record<string, unknown> = {}, status = "resolved") => {
    await db.from("fund_record_sync_items").update({ status, resolution, resolution_note: input.note?.slice(0, 500) ?? null, resolved_by: actorId, resolved_at: nowIso(), ...patch }).eq("id", item.id);
    await audit(offeringId, item.id, `item_${resolution}`, actorId, { category: item.category });
  };
  if (!actionsFor(item.category).includes(input.action)) { await release(); throw new Error("That action is not available for this item."); }

  try {
    switch (input.action) {
      case "review_later":
        await db.from("fund_record_sync_items").update({ status: "later", resolution_note: input.note?.slice(0, 500) ?? null }).eq("id", item.id);
        await audit(offeringId, item.id, "item_review_later", actorId, { category: item.category });
        return { ok: true };
      case "not_investor":
      case "dismiss":
        await finish(input.action === "dismiss" ? "dismissed" : "not_investor", {}, "dismissed");
        return { ok: true };
      case "mark_reviewed":
        await finish("reviewed");
        return { ok: true };
      case "link": {
        // Link an existing folder to an existing Investment in this Fund. File association never grants access.
        const onboardingId = input.onboardingId ?? item.onboarding_id;
        if (!onboardingId || !item.source_ref) throw new Error("Choose the investor in this Fund to link.");
        const { data: ob } = await db.from("investor_onboardings").select("id,offering_id,investment_profile_id").eq("id", onboardingId).maybeSingle();
        if (!ob || ob.offering_id !== offeringId || !ob.investment_profile_id) throw new Error("That investor is not in this Fund.");
        if (!(await isSuperAdmin(context))) throw new Error("Linking Drive folders requires a Super Administrator.");
        const d = await import("@/lib/drive.server");
        await d.linkExistingFolder({ offeringId, profileId: ob.investment_profile_id, folderId: item.source_ref, reason: "Linked from Investor Records Sync" }, { userId: actorId } as any);
        await finish("linked", { onboarding_id: ob.id, investment_profile_id: ob.investment_profile_id });
        return { ok: true, onboardingId: ob.id };
      }
      case "create_folder": {
        if (!item.investment_profile_id) throw new Error("No investing profile on this item.");
        if (!(await isSuperAdmin(context))) throw new Error("Creating Drive folders requires a Super Administrator.");
        const d = await import("@/lib/drive.server");
        const m = await d.ensureInvestorStructure(offeringId, item.investment_profile_id, { userId: actorId } as any);
        if (!m || m.status !== "active") throw new Error(m?.last_error ?? "The investor records folder could not be created.");
        await finish("folder_created");
        return { ok: true };
      }
      case "add_to_fund":
      case "create_investor": {
        // Reuse the canonical manual-investor creation service. Never a second creation path.
        const { createInvestor } = await import("@/lib/investor-record.server");
        const personId = input.action === "add_to_fund" ? (input.personId ?? item.person_id) : null;
        if (input.action === "add_to_fund" && !personId) throw new Error("Choose the existing investor.");
        if (!input.profileId && !input.profileType) throw new Error("Confirm how they are investing.");
        const res: any = await createInvestor(actorId, {
          offeringId, personId, profileId: input.profileId ?? null, confirmedNew: input.action === "create_investor",
          person: input.person ? { firstName: input.person.firstName, lastName: input.person.lastName, email: input.person.email } : {},
          profile: { type: input.profileType ?? "individual" },
          investment: { amountCents: input.amountCents ?? null },
          source: "harmonious",
        });
        await finish(input.action === "add_to_fund" ? "investment_created" : "person_created", { onboarding_id: res?.onboardingId ?? null });
        return { ok: true, onboardingId: res?.onboardingId ?? null };
      }
      case "open":
        await release();
        return { ok: true, onboardingId: item.onboarding_id };
    }
  } catch (e) {
    await release();
    throw e;
  }
  await release();
  return { ok: false };
}

/** Rename a Fund: history is written by the database; never a second Fund. */
export async function renameFund(context: any, input: { offeringId: string; name: string; reason: string; effectiveDate?: string | null | undefined }) {
  const actorId = await requireStaff(context);
  const name = input.name.trim();
  if (!name) throw new Error("Enter the new Fund name.");
  if (!input.reason.trim()) throw new Error("A reason is required to rename a Fund.");
  await assertFundIdentityFree({ name, excludeId: input.offeringId, distinctConfirmed: true }, actorId);
  const db = await admin();
  const { error } = await db.rpc("rename_offering", { _offering: input.offeringId, _name: name, _reason: input.reason.trim().slice(0, 500), _effective: input.effectiveDate ?? null, _actor: actorId });
  if (error) throw new Error(/duplicate_fund_name/.test(error.message) ? "Another Fund already uses that name." : error.message);
  await audit(input.offeringId, null, "fund_renamed", actorId, {});
  return { ok: true };
}

export { fundDuplicateItems };
