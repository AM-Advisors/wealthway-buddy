/**
 * Fund intake from a shared folder (server, staff only). Lists the files behind Google
 * Drive and Box folder links, reads them in small batches with the existing AI readers,
 * and saves only what staff approve, through the existing setup, document and investor
 * engines. No email or invitation is sent; nothing is marked verified, signed or funded.
 * Every sort, save, add, match and skip is an append-only fund_intake_decisions row.
 */
import {
  INTAKE_BATCH, INTAKE_MAX_BYTES, INTAKE_MAX_FILES, amountToCents, groupInvestors, guessSort, investorFileDestination, investorKey,
  parseFolderLink, readableType, type FolderLink, type IntakeSort,
} from "@/lib/fund-intake-model";
import { mergeFundReadings, documentCategoryFor, type FundDocReading } from "@/lib/fund-doc-extract-model";
import type { DocumentReading } from "@/lib/investor-doc-extract-model";

const db = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
const nowIso = () => new Date().toISOString();

async function staff(userId: string) {
  const { assertStaff } = await import("@/lib/investor-onboarding.server");
  return assertStaff(userId);
}
async function decision(runId: string, fileId: string | null, subject: string, action: string, detail: Record<string, unknown>, userId: string) {
  const { error } = await (await db()).from("fund_intake_decisions").insert({ run_id: runId, file_id: fileId, subject, action, detail, actor_user_id: userId });
  if (error) console.error("[fund-intake] decision", error.message);
}
async function runRow(runId: string) {
  const { data } = await (await db()).from("fund_intake_runs").select("*").eq("id", runId).maybeSingle();
  if (!data) throw new Error("That folder pull wasn't found.");
  return data as any;
}

type Listed = { provider: "drive" | "box"; id: string; name: string; path: string; mime: string | null; size: number | null; modified: string | null; shared: string | null };

async function listDrive(link: FolderLink, out: Listed[]) {
  const { gatewayRead } = await import("@/lib/drive-intake.server");
  const walk = async (folderId: string, path: string, depth: number) => {
    if (depth > 5 || out.length >= INTAKE_MAX_FILES) return;
    let kids: any[];
    try { kids = await gatewayRead.children(folderId); }
    catch (e: any) {
      if (e?.status === 404 || e?.status === 403) throw new Error("That Google Drive folder couldn't be opened. Share it with the Harmonious Drive account, then try again.");
      throw e;
    }
    for (const f of kids) {
      if (out.length >= INTAKE_MAX_FILES) return;
      if (f.mimeType === "application/vnd.google-apps.folder") await walk(f.id, path ? `${path}/${f.name}` : f.name, depth + 1);
      else if (!f.trashed) out.push({ provider: "drive", id: f.id, name: f.name, path, mime: f.mimeType ?? null, size: f.size ? Number(f.size) : null, modified: f.modifiedTime ?? null, shared: null });
    }
  };
  await walk(link.id, "", 0);
}

async function listBox(link: FolderLink, out: Listed[]) {
  const box = await import("@/lib/box.server");
  if (!box.isBoxConfigured()) throw new Error("The shared folder service isn't connected yet.");
  const shared = link.kind === "shared" ? link.url : null;
  let rootId = link.id;
  try {
    if (shared) {
      const item = await box.resolveSharedItem(shared);
      if (item.type !== "folder") throw new Error("That link points to a single file. Paste a folder link instead.");
      rootId = item.id;
    }
    const walk = async (folderId: string, path: string, depth: number) => {
      if (depth > 5 || out.length >= INTAKE_MAX_FILES) return;
      for (const e of await box.listFolderItems(folderId, shared)) {
        if (out.length >= INTAKE_MAX_FILES) return;
        if (e.type === "folder") await walk(e.id, path ? `${path}/${e.name}` : e.name, depth + 1);
        else if (e.type === "file") out.push({ provider: "box", id: e.id, name: e.name, path, mime: null, size: e.size, modified: null, shared });
      }
    };
    await walk(rootId, "", 0);
  } catch (e: any) {
    if (/single file/.test(String(e?.message))) throw e;
    throw new Error("That shared folder couldn't be opened. Check the link is shared with \"People with the link\" or with Harmonious, then try again.");
  }
}

/** Starts a pull: lists every file behind the links and saves a first guess at how to use each. */
export async function startFundIntake(userId: string, input: { offeringId: string; links: string[] }) {
  await staff(userId);
  const links = [...new Set(input.links.map((l) => l.trim()).filter(Boolean))].slice(0, 5);
  if (!links.length) throw new Error("Paste a shared folder link.");
  const parsed = links.map((l) => ({ raw: l, link: parseFolderLink(l) }));
  const bad = parsed.find((p) => !p.link);
  if (bad) throw new Error("That isn't a shared folder link we can read. Paste a Google Drive or shared folder link.");
  const d = await db();
  const { data: fund } = await d.from("offerings").select("id").eq("id", input.offeringId).maybeSingle();
  if (!fund) throw new Error("That fund wasn't found.");
  const files: Listed[] = [];
  for (const p of parsed) {
    if (p.link!.provider === "drive") await listDrive(p.link!, files); else await listBox(p.link!, files);
  }
  if (!files.length) throw new Error("No files were found in that folder.");
  const { data: run, error } = await d.from("fund_intake_runs").insert({ offering_id: input.offeringId, sources: parsed.map((p) => ({ provider: p.link!.provider, url: p.link!.url })), created_by: userId }).select("id").single();
  if (error) throw new Error(error.message);
  const rows = files.map((f) => {
    const sort: IntakeSort = (f.size ?? 0) > INTAKE_MAX_BYTES ? "skip" : guessSort(f.name, f.path, f.mime);
    return { run_id: run.id, offering_id: input.offeringId, provider: f.provider, source_file_id: f.id, name: f.name.slice(0, 300), folder_path: f.path.slice(0, 500) || null, mime_type: f.mime, size_bytes: f.size,
      sort, status: sort === "skip" ? "skipped" : "listed", error: (f.size ?? 0) > INTAKE_MAX_BYTES ? "Over 10 MB" : !readableType(f.name, f.mime) ? "Only PDFs and photos can be read" : null,
      applied: { meta: { modified: f.modified, shared: f.shared } } };
  });
  const { error: fe } = await d.from("fund_intake_files").insert(rows);
  if (fe) throw new Error(fe.message);
  await decision(run.id, null, "run", "started", { links: parsed.map((p) => p.link!.provider), files: rows.length }, userId);
  return { runId: run.id as string, files: rows.length, capped: files.length >= INTAKE_MAX_FILES };
}

async function download(f: any): Promise<{ bytes: Uint8Array; contentType: string }> {
  const contentType = readableType(f.name, f.mime_type);
  if (!contentType) throw new Error("Only PDFs and photos can be read");
  let bytes: Uint8Array;
  if (f.provider === "drive") {
    const { gatewayRead } = await import("@/lib/drive-intake.server");
    const exportMime = f.mime_type === "application/vnd.google-apps.document" ? "application/pdf" : null;
    bytes = await gatewayRead.download({ id: f.source_file_id } as any, exportMime);
  } else {
    bytes = await (await import("@/lib/box.server")).downloadSharedFile(f.source_file_id, f.applied?.meta?.shared ?? null);
  }
  if (bytes.byteLength > INTAKE_MAX_BYTES) throw new Error("Over 10 MB");
  return { bytes, contentType };
}
const b64 = (bytes: Uint8Array) => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };

/** Reads the next few files with AI and saves their suggestions. Call repeatedly until none are left. */
export async function readFundIntakeBatch(userId: string, runId: string) {
  await staff(userId);
  const run = await runRow(runId);
  const d = await db();
  // Files stuck "reading" for 10+ minutes go back to the queue.
  await d.from("fund_intake_files").update({ status: "listed" }).eq("run_id", runId).eq("status", "reading").lt("updated_at", new Date(Date.now() - 600_000).toISOString());
  const { data: next } = await d.from("fund_intake_files").select("*").eq("run_id", runId).eq("status", "listed").neq("sort", "skip").order("created_at").limit(INTAKE_BATCH);
  const batch = (next ?? []) as any[];
  if (batch.length) await d.from("fund_intake_files").update({ status: "reading", updated_at: nowIso() }).in("id", batch.map((f) => f.id)).eq("status", "listed");
  await Promise.all(batch.map(async (f) => {
    try {
      const { bytes, contentType } = await download(f);
      const base64 = b64(bytes);
      const patch: any = { status: "read", error: null, read_at: nowIso(), updated_at: nowIso() };
      if (f.sort === "fund") patch.fund_reading = await (await import("@/lib/fund-doc-extract.server")).readFundSetupDocument(userId, { offeringId: run.offering_id, fileName: f.name, contentType, base64 });
      else patch.investor_reading = await (await import("@/lib/investor-doc-extract.server")).readNewInvestorDocument(userId, { offeringId: run.offering_id, fileName: f.name, contentType, base64 });
      await d.from("fund_intake_files").update(patch).eq("id", f.id);
    } catch (e: any) {
      await d.from("fund_intake_files").update({ status: "failed", error: String(e?.message ?? e).slice(0, 300), updated_at: nowIso() }).eq("id", f.id);
    }
  }));
  const { count } = await d.from("fund_intake_files").select("id", { count: "exact", head: true }).eq("run_id", runId).eq("status", "listed").neq("sort", "skip");
  return { read: batch.length, remaining: count ?? 0 };
}

/** Change how a file is used. Read again if it was already read for the other purpose. */
export async function setFundIntakeSort(userId: string, input: { fileId: string; sort: IntakeSort }) {
  await staff(userId);
  const d = await db();
  const { data: f } = await d.from("fund_intake_files").select("*").eq("id", input.fileId).maybeSingle();
  if (!f) throw new Error("That file wasn't found.");
  if (f.sort === input.sort) return { ok: true };
  if (input.sort !== "skip" && !readableType(f.name, f.mime_type)) throw new Error("Only PDFs and photos can be read.");
  const needsRead = input.sort === "fund" ? !f.fund_reading : input.sort === "investor" ? !f.investor_reading : false;
  await d.from("fund_intake_files").update({ sort: input.sort, status: input.sort === "skip" ? "skipped" : needsRead ? "listed" : "read", updated_at: nowIso() }).eq("id", f.id);
  await decision(f.run_id, f.id, "file", "sorted", { from: f.sort, to: input.sort }, userId);
  return { ok: true };
}

async function fundInvestors(offeringId: string) {
  const d = await db();
  const { data: obs } = await d.from("investor_onboardings").select("id, person_id, investment_profile_id").eq("offering_id", offeringId).is("removed_at", null).limit(2000);
  const O = (obs ?? []) as any[];
  const pids = [...new Set(O.map((o) => o.person_id).filter(Boolean))];
  const prof = [...new Set(O.map((o) => o.investment_profile_id).filter(Boolean))];
  const [{ data: ppl }, { data: profiles }] = await Promise.all([
    pids.length ? d.from("persons").select("id, legal_first_name, legal_last_name, email").in("id", pids) : { data: [] },
    prof.length ? d.from("investment_profiles").select("id, legal_name, profile_type").in("id", prof) : { data: [] },
  ]);
  const P = new Map(((ppl ?? []) as any[]).map((p) => [p.id, p]));
  const R = new Map(((profiles ?? []) as any[]).map((p) => [p.id, p]));
  return O.map((o) => {
    const p: any = P.get(o.person_id) ?? {}; const r: any = R.get(o.investment_profile_id);
    const name = [p.legal_first_name, p.legal_last_name].filter(Boolean).join(" ");
    return { onboardingId: o.id, name: r && r.profile_type !== "individual" && r.legal_name ? `${r.legal_name} (${name})` : name || p.email || "Investor",
      keys: [investorKey({ email: p.email ?? null, entityName: null, firstName: p.legal_first_name ?? null, lastName: p.legal_last_name ?? null }),
        p.email ? `m:${String(p.email).toLowerCase()}` : null, r?.legal_name && r.profile_type !== "individual" ? investorKey({ entityName: r.legal_name, email: null, firstName: null, lastName: null }) : null].filter(Boolean) as string[] };
  });
}

/** Everything for the review screen: files, merged fund details, documents and grouped investors. */
export async function fundIntakeReview(userId: string, runId: string) {
  await staff(userId);
  const run = await runRow(runId);
  const d = await db();
  const [{ data: files }, { data: decs }] = await Promise.all([
    d.from("fund_intake_files").select("*").eq("run_id", runId).order("folder_path", { nullsFirst: true }).order("name"),
    d.from("fund_intake_decisions").select("subject, action, detail, created_at").eq("run_id", runId).eq("subject", "investor").order("created_at"),
  ]);
  const F = (files ?? []) as any[];
  const { fundSetupAiCurrentValues } = await import("@/lib/fund-doc-extract.server");
  const cur = await fundSetupAiCurrentValues(userId, run.offering_id);
  const fundRead = F.filter((f) => f.sort === "fund" && f.status === "read" && f.fund_reading);
  const fieldRows = mergeFundReadings(fundRead.map((f) => ({ fileName: f.name, reading: f.fund_reading as FundDocReading })), cur.values);
  const investorRead = F.filter((f) => f.sort === "investor" && f.status === "read" && f.investor_reading);
  const groups = groupInvestors(investorRead.map((f) => ({ fileId: f.id, fileName: f.name, documentKind: (f.investor_reading as DocumentReading).documentKind, investors: (f.investor_reading as DocumentReading).investors })));
  const existing = await fundInvestors(run.offering_id);
  const decided = new Map<string, any>();
  for (const x of (decs ?? []) as any[]) if (x.detail?.key) decided.set(x.detail.key, { action: x.action, onboardingId: x.detail.onboardingId ?? null, at: x.created_at });
  const { data: off } = await d.from("offerings").select("name, fund_origin").eq("id", run.offering_id).maybeSingle();
  return {
    run: { id: run.id, offeringId: run.offering_id, fundName: off?.name ?? null, origin: off?.fund_origin ?? null, sources: run.sources, createdAt: run.created_at },
    files: F.map((f) => ({ id: f.id, name: f.name, folder: f.folder_path, provider: f.provider, sort: f.sort, status: f.status, error: f.error,
      documentKind: f.fund_reading?.documentKind ?? f.investor_reading?.documentKind ?? null, notes: (f.fund_reading?.notes ?? f.investor_reading?.notes ?? []) as string[],
      category: f.fund_reading ? documentCategoryFor(f.fund_reading.documentKind) : null, savedDocument: Boolean(f.applied?.document) })),
    counts: { total: F.length, read: F.filter((f) => f.status === "read").length, waiting: F.filter((f) => f.status === "listed" || f.status === "reading").length, failed: F.filter((f) => f.status === "failed").length, skipped: F.filter((f) => f.status === "skipped").length },
    fieldRows, hasMultipleClasses: cur.hasMultipleClasses,
    investors: groups.map((g) => {
      const match = existing.find((e) => e.keys.includes(g.key) || (g.investor.email ? e.keys.includes(`m:${g.investor.email.toLowerCase()}`) : false)) ?? null;
      return { ...g, match: match ? { onboardingId: match.onboardingId, name: match.name } : null, decided: decided.get(g.key) ?? null };
    }),
    existing: existing.map((e) => ({ onboardingId: e.onboardingId, name: e.name })),
  };
}

/** Saves a fund document into the fund's Documents as a new version; activation stays a separate approval. */
export async function saveFundIntakeDocument(userId: string, input: { fileId: string }) {
  await staff(userId);
  const d = await db();
  const { data: f } = await d.from("fund_intake_files").select("*").eq("id", input.fileId).maybeSingle();
  if (!f || f.sort !== "fund" || !f.fund_reading) throw new Error("Read this file as a fund document first.");
  if (f.applied?.document) throw new Error("This file is already in Documents.");
  const category = documentCategoryFor(f.fund_reading.documentKind) ?? "other";
  const { bytes, contentType } = await download(f);
  const engine = await import("@/lib/offering-document-setup.server");
  const doc: any = await engine.createSetupDocument(userId, { offeringId: f.offering_id, category, title: category === "other" ? f.name.replace(/\.[^.]+$/, "").slice(0, 200) : null });
  const documentId = String(doc?.id ?? doc?.documentId ?? "");
  if (!documentId) throw new Error("The document couldn't be added.");
  const fileName = contentType === "application/pdf" && !/\.pdf$/i.test(f.name) ? `${f.name}.pdf` : f.name;
  const path = `${f.offering_id}/setup/${documentId}/${Date.now()}-${fileName.replace(/[^\w.\-]+/g, "_")}`;
  const { error } = await d.storage.from("offering-files").upload(path, new Blob([bytes as unknown as BlobPart], { type: contentType }), { contentType });
  if (error) throw new Error(error.message);
  await engine.uploadDocumentVersion(userId, { documentId, filePath: path, fileName, fileSizeBytes: bytes.byteLength });
  await d.from("fund_intake_files").update({ applied: { ...(f.applied ?? {}), document: { documentId, at: nowIso() } }, updated_at: nowIso() }).eq("id", f.id);
  await decision(f.run_id, f.id, "document", "saved", { documentId, category }, userId);
  return { documentId };
}

/**
 * Adds a grouped investor (no invitation), matches them to someone already on the fund, or skips.
 * Their files are filed by investorFileDestination: earlier signed copies or review uploads.
 */
export async function applyFundIntakeInvestor(userId: string, input: { runId: string; key: string; action: "add" | "match" | "skip"; onboardingId?: string | null | undefined; profileType?: "individual" | "trust" | "entity" | null | undefined; legalName?: string | null | undefined; confirmedNew?: boolean | undefined }) {
  await staff(userId);
  const review = await fundIntakeReview(userId, input.runId);
  const g = review.investors.find((x) => x.key === input.key);
  if (!g) throw new Error("That investor is no longer in the list. Refresh and try again.");
  if (g.decided && g.decided.action !== "skipped") throw new Error("This investor was already handled.");
  if (input.action === "skip") { await decision(input.runId, null, "investor", "skipped", { key: g.key }, userId); return { ok: true, onboardingId: null, filed: 0, problems: [] as string[] }; }
  let onboardingId: string;
  const inv = g.investor;
  if (input.action === "match") {
    if (!input.onboardingId || !review.existing.some((e) => e.onboardingId === input.onboardingId)) throw new Error("Choose who on the fund this is.");
    onboardingId = input.onboardingId;
  } else {
    if (!inv.firstName || !inv.lastName) throw new Error("A first and last name are needed. Use Add investor for this person instead.");
    const type = input.profileType ?? (inv.profileType === "trust" ? "trust" : inv.profileType === "entity" ? "entity" : "individual");
    const legalName = type === "individual" ? null : (input.legalName?.trim() || inv.entityName || null);
    if (type !== "individual" && !legalName) throw new Error("Enter the trust or company's legal name.");
    const { createInvestor } = await import("@/lib/investor-record.server");
    const created = await createInvestor(userId, {
      offeringId: review.run.offeringId,
      ...(input.confirmedNew ? { confirmedNew: true } : {}),
      person: { firstName: inv.firstName, lastName: inv.lastName, ...(inv.email ? { email: inv.email } : {}), ...(inv.phone ? { phone: inv.phone } : {}) } as any,
      profile: { type, legalName },
      investment: { amountCents: amountToCents(inv.amount) },
      source: "document",
      allowMissingEmail: !inv.email,
    });
    onboardingId = created.onboardingId;
  }
  const { migrationApplies } = await import("@/lib/fund-origin");
  const migration = migrationApplies(review.run.origin);
  const d = await db();
  const problems: string[] = [];
  let filed = 0;
  for (const file of g.files) {
    const dest = investorFileDestination(file.kind, migration);
    if (dest.to === "none") continue;
    try {
      const { data: f } = await d.from("fund_intake_files").select("*").eq("id", file.fileId).maybeSingle();
      const { bytes, contentType } = await download(f);
      if (dest.to === "upload") {
        await (await import("@/lib/investor-extras.server")).uploadDocFor(userId, { onboardingId, kind: dest.uploadKind as any, fileName: f.name, contentType, base64: b64(bytes) });
      } else {
        const path = `prior-imports/${review.run.offeringId}/${onboardingId}/${Date.now()}-${f.name.replace(/[^\w.\-]+/g, "_")}`;
        const { error } = await d.storage.from("signed-documents").upload(path, new Blob([bytes as unknown as BlobPart], { type: contentType }), { contentType });
        if (error) throw new Error(error.message);
        const modified = f.applied?.meta?.modified ? String(f.applied.meta.modified).slice(0, 10) : null;
        const signedOn = modified && new Date(modified) <= new Date() ? modified : new Date().toISOString().slice(0, 10);
        await (await import("@/lib/prior-signed-documents.server")).recordPriorDoc(d, userId, { fundId: review.run.offeringId, onboardingId, path, fileName: f.name, kind: dest.priorKind, title: f.name.replace(/\.[^.]+$/, "").slice(0, 200), signedOn,
          note: `From a shared folder pull. Signed date ${modified ? "taken from the file's last change date" : "not on the file"}; confirm it on the record.` });
      }
      filed += 1;
    } catch (e: any) { problems.push(`${file.fileName}: ${String(e?.message ?? e).replace(/^Forbidden:\s*/, "")}`); }
  }
  await decision(input.runId, null, "investor", input.action === "add" ? "added" : "matched", { key: g.key, onboardingId, filed, problems: problems.length }, userId);
  return { ok: true, onboardingId, filed, problems };
}

export async function listFundIntakeRuns(userId: string, offeringId: string) {
  await staff(userId);
  const { data } = await (await db()).from("fund_intake_runs").select("id, sources, created_at").eq("offering_id", offeringId).order("created_at", { ascending: false }).limit(10);
  return (data ?? []) as { id: string; sources: any; created_at: string }[];
}
