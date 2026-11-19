/**
 * Server side of Fund Drive intake. Operations only. Reads the fund's linked Drive folder
 * (read-only), proposes a row per file, and on explicit approval saves the file through the
 * existing signed-outside and investor document engines. Decisions are append-only events.
 */
import { FOLDER_MIME, GOOGLE_DOC_MIME, driveIdFromLink, driveQueryLiteral, readableAs } from "@/lib/drive-picker-model";
import { PROFILE_FILL_MAX_BYTES, classifyFileName, defaultSignedOn, pickInvestorFor, intakeTarget, matchFolder, type IntakeDecision, type IntakeRow, type IntakeTarget, type RosterEntry } from "@/lib/fund-drive-intake-model";

const GATEWAY = "https://connector-gateway.lovable.dev/google_drive/drive/v3";
const ALL = "supportsAllDrives=true&includeItemsFromAllDrives=true";
const OPS = ["admin", "super_admin", "operations", "fund_administration"];
const EVENT = "drive_intake_decision";
const MAX_BYTES = 50 * 1024 * 1024;

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;

function headers() {
  const lk = process.env["LOVABLE_API_KEY"], dk = process.env["GOOGLE_DRIVE_API_KEY"];
  if (!lk || !dk) throw new Error("Google Drive isn't connected for this app.");
  return { Authorization: `Bearer ${lk}`, "X-Connection-Api-Key": dk };
}
async function get(path: string) {
  const res = await fetch(`${GATEWAY}${path}`, { headers: headers() });
  if (!res.ok) {
    console.error(`Fund drive intake request failed [${res.status}]: ${(await res.text().catch(() => "")).slice(0, 300)}`);
    if (res.status === 404) throw new Error("The fund's Drive folder wasn't found, or Harmonious doesn't have access to it.");
    throw new Error(`Google Drive couldn't be read right now [${res.status}].`);
  }
  return res.json();
}
type Meta = { id: string; name: string; mimeType: string; size?: string; modifiedTime?: string };
async function children(folderId: string): Promise<Meta[]> {
  const out: Meta[] = []; let token = "";
  for (let i = 0; i < 5; i++) {
    const q = `'${driveQueryLiteral(folderId)}' in parents and trashed=false`;
    const d = await get(`/files?q=${encodeURIComponent(q)}&${ALL}&corpora=allDrives&pageSize=300&orderBy=folder,name&fields=${encodeURIComponent("nextPageToken,files(id,name,mimeType,size,modifiedTime)")}${token ? `&pageToken=${encodeURIComponent(token)}` : ""}`);
    out.push(...((d.files ?? []) as Meta[])); token = d.nextPageToken ?? ""; if (!token) break;
  }
  return out;
}

export async function assertOps(userId: string) {
  const d = await admin();
  const { data, error } = await d.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error("Access could not be checked.");
  if (!((data ?? []) as any[]).some((r) => OPS.includes(String(r.role)))) throw new Error("Only the Harmonious Operations team can use Drive intake.");
  return d;
}

async function roster(d: any, fundId: string): Promise<(RosterEntry & { label: string })[]> {
  const { data, error } = await d.from("investor_onboardings").select("id, person_id, investment_profile_id, removed_at").eq("offering_id", fundId).is("removed_at", null);
  if (error) throw new Error("The fund's investors could not be loaded.");
  const rows = (data ?? []) as any[];
  const pIds = [...new Set(rows.map((r) => r.person_id).filter(Boolean))], fIds = [...new Set(rows.map((r) => r.investment_profile_id).filter(Boolean))];
  const [ps, fs] = await Promise.all([
    pIds.length ? d.from("persons").select("id, legal_first_name, legal_last_name, email").in("id", pIds) : { data: [] },
    fIds.length ? d.from("investment_profiles").select("id, legal_name, display_label").in("id", fIds) : { data: [] },
  ]);
  const pm = new Map(((ps.data ?? []) as any[]).map((p) => [p.id, p])), fm = new Map(((fs.data ?? []) as any[]).map((p) => [p.id, p]));
  return rows.map((r) => {
    const p: any = pm.get(r.person_id), f: any = fm.get(r.investment_profile_id);
    const person = [p?.legal_first_name, p?.legal_last_name].filter(Boolean).join(" ");
    const names = [f?.legal_name, f?.display_label, person].filter((n) => n && String(n).trim().length >= 3).map(String);
    const label = f?.legal_name && person && f.legal_name !== person ? `${f.legal_name} (${person})` : (f?.legal_name || person || p?.email || "Unnamed investor");
    return { onboardingId: r.id as string, names: [...new Set(names)], label };
  }).sort((a, b) => a.label.localeCompare(b.label));
}

async function decisions(d: any, fundId: string) {
  const { data, error } = await d.from("investor_onboarding_events").select("onboarding_id, detail, created_at").eq("offering_id", fundId).eq("event", EVENT).order("created_at", { ascending: true });
  if (error) throw new Error("Earlier decisions could not be loaded.");
  const m = new Map<string, { decision: IntakeDecision; onboardingId: string | null; target: IntakeTarget | null }>();
  for (const e of (data ?? []) as any[]) {
    const fid = e.detail?.file_id; if (!fid) continue;
    const prev = m.get(fid);
    if (prev?.decision === "approved") continue; // an applied file stays applied
    m.set(fid, { decision: e.detail.decision, onboardingId: e.onboarding_id ?? null, target: e.detail.target ?? null });
  }
  return m;
}

export async function scanFundDrive(userId: string, fundId: string, folderLink?: string | null) {
  const d = await assertOps(userId);
  const { data: o } = await d.from("offerings").select("drive_folder_url").eq("id", fundId).maybeSingle();
  const pasted = folderLink?.trim() ? driveIdFromLink(folderLink) : null;
  if (folderLink?.trim() && pasted?.kind !== "folder") throw new Error("Paste a Google Drive folder link.");
  const link = pasted ?? (o?.drive_folder_url ? driveIdFromLink(String(o.drive_folder_url)) : null);
  const people = await roster(d, fundId);
  const investors = people.map((p) => ({ onboardingId: p.onboardingId, label: p.label }));
  if (!link || link.kind !== "folder") return { folderName: null as string | null, folderId: null as string | null, investors, rows: [] as IntakeRow[], note: "This fund has no Google Drive folder linked yet. Paste the Investors folder link above." };
  const top = await children(link.id);
  // A pasted folder is used as is; the fund's folder opens its Investors subfolder.
  let invFolder = pasted ? null : top.find((f) => f.mimeType === FOLDER_MIME && /^investors?$/i.test(f.name.trim())) ?? top.find((f) => f.mimeType === FOLDER_MIME && /investor/i.test(f.name));
  let base = invFolder ? await children(invFolder.id) : top;
  // Step through single wrapper folders (e.g. an unzipped "Investors-2026..." folder).
  for (let i = 0; i < 2; i++) {
    const subs = base.filter((f) => f.mimeType === FOLDER_MIME);
    if (subs.length !== 1 || base.length !== 1) break;
    invFolder = subs[0]!; base = await children(invFolder.id);
  }
  const folders = base.filter((f) => f.mimeType === FOLDER_MIME);
  const done = await decisions(d, fundId);
  const rows: IntakeRow[] = [];
  const toRow = (f: Meta, folderName: string, matched: string | null): IntakeRow => {
    const prior = done.get(f.id);
    return {
      fileId: f.id, fileName: f.name, folderName, modifiedTime: f.modifiedTime ?? null, size: f.size == null ? null : Number(f.size),
      onboardingId: prior?.onboardingId ?? matched, target: prior?.target ?? classifyFileName(f.name), decision: prior?.decision ?? null,
      readable: f.mimeType === GOOGLE_DOC_MIME || /^(application\/pdf|image\/)/.test(f.mimeType),
    };
  };
  for (let i = 0; i < folders.length; i += 8) {
    const batch = folders.slice(i, i + 8);
    const lists = await Promise.all(batch.map(async (fo) => {
      const items = await children(fo.id);
      const nested = items.filter((x) => x.mimeType === FOLDER_MIME).slice(0, 5);
      const deeper = (await Promise.all(nested.map((n) => children(n.id).catch(() => [])))).flat();
      return { fo, files: [...items, ...deeper].filter((x) => x.mimeType !== FOLDER_MIME) };
    }));
    for (const { fo, files } of lists) {
      const matched = matchFolder(fo.name, people);
      for (const f of files) rows.push(toRow(f, fo.name, matched));
    }
  }
  for (const f of base.filter((x) => x.mimeType !== FOLDER_MIME)) rows.push(toRow(f, invFolder?.name ?? "Fund folder", null));
  return { folderName: invFolder?.name ?? (pasted ? "Pasted folder" : "Fund folder"), folderId: invFolder?.id ?? link.id, investors, rows, note: null as string | null };
}

async function logDecision(d: any, userId: string, fundId: string, onboardingId: string | null, detail: Record<string, unknown>) {
  const { error } = await d.from("investor_onboarding_events").insert({ offering_id: fundId, onboarding_id: onboardingId, event: EVENT, actor_user_id: userId, actor_role: "harmonious", detail });
  if (error) throw new Error("The decision could not be saved.");
}

async function belongs(d: any, fundId: string, onboardingId: string) {
  const { data } = await d.from("investor_onboardings").select("id, offering_id, removed_at").eq("id", onboardingId).maybeSingle();
  if (!data || data.offering_id !== fundId || data.removed_at) throw new Error("That investor isn't in this fund.");
}

/** Review later or Reject: nothing is saved to the investor; only the decision is recorded. */
export async function setIntakeDecision(userId: string, input: { fundId: string; fileId: string; fileName: string; decision: "later" | "rejected"; onboardingId?: string | null | undefined; target?: string | null | undefined }) {
  const d = await assertOps(userId);
  if (input.onboardingId) await belongs(d, input.fundId, input.onboardingId);
  const prev = (await decisions(d, input.fundId)).get(input.fileId);
  if (prev?.decision === "approved") throw new Error("This file was already added to the investor.");
  await logDecision(d, userId, input.fundId, input.onboardingId ?? null, { file_id: input.fileId, file_name: input.fileName, decision: input.decision, target: input.target ?? null });
  return { ok: true };
}

/** Approve: copy the Drive file into the investor's record through the existing engines. */
export async function approveIntakeFile(userId: string, input: { fundId: string; fileId: string; onboardingId: string; target: string; signedOn: string; title: string }) {
  const d = await assertOps(userId);
  await belongs(d, input.fundId, input.onboardingId);
  const t = intakeTarget(input.target);
  if (!t) throw new Error("Choose where this document goes.");
  const prev = (await decisions(d, input.fundId)).get(input.fileId);
  if (prev?.decision === "approved") throw new Error("This file was already added.");

  const m: Meta & { driveId?: string; trashed?: boolean } = await get(`/files/${encodeURIComponent(input.fileId)}?supportsAllDrives=true&fields=id,name,mimeType,size,driveId,trashed,modifiedTime`);
  if (m.trashed) throw new Error("That file is in the Drive trash.");
  const r = readableAs(m.mimeType, null);
  if (!r.ok) throw new Error(`${m.name}: only PDFs, images and Google Docs can be added.`);
  const path = m.mimeType === GOOGLE_DOC_MIME ? `/files/${encodeURIComponent(m.id)}/export?mimeType=application%2Fpdf` : `/files/${encodeURIComponent(m.id)}?alt=media&supportsAllDrives=true`;
  const res = await fetch(`${GATEWAY}${path}`, { headers: headers() });
  if (!res.ok) { console.error(`Fund drive intake download failed [${res.status}]`); throw new Error(`The file couldn't be downloaded from Drive [${res.status}].`); }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!bytes.byteLength) throw new Error("That file is empty.");
  if (bytes.byteLength > MAX_BYTES) throw new Error("Files can be up to 50 MB.");
  const fileName = (m.mimeType === GOOGLE_DOC_MIME && !/\.pdf$/i.test(m.name) ? `${m.name}.pdf` : m.name).slice(0, 255);
  const signedOn = input.signedOn || defaultSignedOn(m.modifiedTime ?? null);

  let resultId: string;
  if (t.store === "prior") {
    const prior = await import("@/lib/prior-signed-documents.server");
    const start = await prior.startPriorUpload(d, userId, { fundId: input.fundId, onboardingId: input.onboardingId, fileName });
    const up = await d.storage.from("signed-documents").uploadToSignedUrl(start.path, start.token, bytes, { contentType: r.as });
    if (up.error) throw new Error("The file couldn't be saved.");
    const rec = await prior.recordPriorDoc(d, userId, {
      fundId: input.fundId, onboardingId: input.onboardingId, path: start.path, fileName, kind: t.key as any,
      title: input.title.trim() || fileName, signedOn, note: "Added from the fund's Google Drive by Operations",
    });
    resultId = rec.id;
  } else {
    const { uploadDocFor } = await import("@/lib/investor-extras.server");
    let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const rec = await uploadDocFor(userId, { onboardingId: input.onboardingId, kind: t.key.replace(/^doc_/, "") as any, fileName, contentType: r.as, base64: btoa(bin) });
    resultId = rec.id;
  }
  await logDecision(d, userId, input.fundId, input.onboardingId, { file_id: input.fileId, file_name: m.name, decision: "approved", target: t.key, result_id: resultId, signed_on: signedOn });
  return { ok: true, id: resultId };
}

/** Short-lived Drive preview link for Operations to open the file in a new tab. */
export async function intakeFileLink(userId: string, fileId: string) {
  await assertOps(userId);
  const m = await get(`/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=webViewLink`);
  return { url: String(m.webViewLink ?? `https://drive.google.com/file/d/${fileId}/view`) };
}

/** The Drive folder names someone not on this fund: Operations confirm the details and add them (no invitation). */
export async function addIntakeInvestor(userId: string, input: { fundId: string; folderName: string; draft: { type: "individual" | "entity" | "trust"; firstName: string; lastName: string; legalName: string; email: string }; confirmedNew: boolean }) {
  const d = await assertOps(userId);
  const { draftProblems } = await import("@/lib/doc-to-new-investor");
  const v = input.draft;
  const problems = draftProblems({ ...v, email: v.email.trim().toLowerCase(), middleName: "", phone: "", dateOfBirth: "", citizenship: "", addressLine1: "", addressLine2: "", city: "", region: "", postalCode: "", country: "" });
  if (problems.length) throw new Error(problems[0]);
  const { createInvestor } = await import("@/lib/investor-record.server");
  const email = v.email.trim().toLowerCase();
  const created = await createInvestor(userId, {
    offeringId: input.fundId,
    confirmedNew: input.confirmedNew,
    person: { firstName: v.firstName.trim(), lastName: v.lastName.trim(), email: email || undefined },
    profile: { type: v.type, legalName: v.type === "individual" ? null : v.legalName.trim() },
    investment: {},
    allowMissingEmail: !email,
  });
  await d.from("investor_onboarding_events").insert({ offering_id: input.fundId, onboarding_id: created.onboardingId, event: "drive_intake_investor_added", actor_user_id: userId, actor_role: "harmonious", detail: { folder_name: input.folderName.slice(0, 200), has_email: !!email } });
  const person = `${v.firstName.trim()} ${v.lastName.trim()}`;
  return { onboardingId: created.onboardingId as string, label: v.type === "individual" ? person : `${v.legalName.trim()} (${person})` };
}

/** Reads one Drive file with the shared investor AI reader (every page). Nothing is saved or stored. */
export async function readIntakeFile(userId: string, input: { fundId: string; fileId: string }) {
  await assertOps(userId);
  const m: Meta & { trashed?: boolean } = await get(`/files/${encodeURIComponent(input.fileId)}?supportsAllDrives=true&fields=id,name,mimeType,size,trashed`);
  if (m.trashed) throw new Error("That file is in the Drive trash.");
  const r = readableAs(m.mimeType, null);
  if (!r.ok) throw new Error(`${m.name}: only PDFs, images and Google Docs can be read.`);
  const path = m.mimeType === GOOGLE_DOC_MIME ? `/files/${encodeURIComponent(m.id)}/export?mimeType=application%2Fpdf` : `/files/${encodeURIComponent(m.id)}?alt=media&supportsAllDrives=true`;
  const res = await fetch(`${GATEWAY}${path}`, { headers: headers() });
  if (!res.ok) { console.error(`Fund drive intake download failed [${res.status}]`); throw new Error(`The file couldn't be downloaded from Drive [${res.status}].`); }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!bytes.byteLength) throw new Error("That file is empty.");
  if (bytes.byteLength > PROFILE_FILL_MAX_BYTES) throw new Error(`${m.name} is over 10 MB, so it can't be read with AI.`);
  let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const { readNewInvestorDocument } = await import("@/lib/investor-doc-extract.server");
  return readNewInvestorDocument(userId, { offeringId: input.fundId, fileName: m.name, contentType: r.as, base64: btoa(bin) });
}

/**
 * Completes one investor's profile from what was read in their folder: picks the reading that is
 * them, fills blank details and sends differences to review (completeProfileFromReading).
 */
export async function fillProfileFromIntake(userId: string, input: { fundId: string; onboardingId: string; folderName: string; investors: unknown[] }) {
  const d = await assertOps(userId);
  await belongs(d, input.fundId, input.onboardingId);
  const { normalizeReading, mergeInvestors, mergeInvestorInto } = await import("@/lib/investor-doc-extract-model");
  // Re-check every value with the same cleaning as a fresh reading.
  const toRaw = (i: any) => ({
    first_name: i?.firstName, middle_name: i?.middleName, last_name: i?.lastName, preferred_name: i?.preferredName, email: i?.email, phone: i?.phone,
    investor_type: i?.profileType, entity_name: i?.entityName, entity_type: i?.entityType, jurisdiction: i?.jurisdiction, trust_type: i?.trustType,
    address_line1: i?.addressLine1, address_line2: i?.addressLine2, city: i?.city, region: i?.region, postal_code: i?.postalCode, country: i?.country,
    mailing_address: i?.mailingAddress, date_of_birth: i?.dateOfBirth, citizenship: i?.citizenship, amount: i?.amount, commitment: i?.commitment,
    investment_date: i?.investmentDate, units: i?.units,
    related_people: (Array.isArray(i?.related) ? i.related : []).map((r: any) => ({ first_name: r?.firstName, last_name: r?.lastName, email: r?.email, role: r?.role, ownership_percent: r?.ownershipPercent, is_signer: r?.isSigner })),
  });
  const list = mergeInvestors(normalizeReading({ investors: input.investors.slice(0, 50).map(toRaw) }, { keepBirthDate: true }).investors);
  if (!list.length) throw new Error("No investor details were found in this folder's documents.");
  const entry = (await roster(d, input.fundId)).find((r) => r.onboardingId === input.onboardingId);
  const names = [...(entry?.names ?? []), input.folderName];
  const picked = pickInvestorFor(names, list);
  if (!picked) throw new Error(`The documents name ${list.length} different people and none match ${entry?.label ?? "this investor"}. Use each investor's own folder.`);
  // Signers or owners read as separate entries on the same entity's papers are kept as its owners.
  for (const other of list) if (other !== picked && picked.entityName && other.entityName && other.entityName.toLowerCase() === picked.entityName.toLowerCase()) mergeInvestorInto(picked, other);
  const { completeProfileFromReading } = await import("@/lib/investor-profile-fill.server");
  const out = await completeProfileFromReading(userId, { onboardingId: input.onboardingId, investor: picked, sourceRef: `Drive folder ${input.folderName}` });
  return out;
}
