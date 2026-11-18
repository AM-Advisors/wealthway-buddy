// Server-only: Harmonious staff browse the team's shared Google Drives and pick
// investor documents for the AI reader. Read-only: nothing in Drive changes.

import { assertOnboardingAccess, forbid } from "@/lib/investor-onboarding.server";
import { serviceError } from "@/lib/service-error";
import {
  FOLDER_MIME, GOOGLE_DOC_MIME, MAX_PICK_BYTES, driveIdFromLink, driveQueryLiteral, isDriveId, pickedFileName, readableAs, sortEntries, toEntry,
  type DriveCrumb, type DriveEntry, type PickMime,
} from "@/lib/drive-picker-model";

const GATEWAY = "https://connector-gateway.lovable.dev/google_drive/drive/v3";
const ALL = "supportsAllDrives=true&includeItemsFromAllDrives=true";

function headers() {
  const lk = process.env["LOVABLE_API_KEY"], dk = process.env["GOOGLE_DRIVE_API_KEY"];
  if (!lk || !dk) throw new Error("Google Drive isn't connected for this app.");
  return { Authorization: `Bearer ${lk}`, "X-Connection-Api-Key": dk };
}

async function get(path: string) {
  const res = await fetch(`${GATEWAY}${path}`, { headers: headers() });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`Drive picker request failed [${res.status}]: ${body.slice(0, 300)}`);
    if (res.status === 404) throw new Error("That Drive folder or file wasn't found, or Harmonious doesn't have access to it.");
    throw serviceError("Google Drive", "browsing", res.status);
  }
  return res.json();
}

async function staffOnly(userId: string, onboardingId: string) {
  const { role, row } = await assertOnboardingAccess(userId, onboardingId);
  if (role !== "staff") forbid("only Harmonious can pick documents from Google Drive.");
  return row as { offering_id: string; investment_profile_id: string | null; person_id: string | null };
}

type Meta = { id: string; name: string; mimeType: string; size?: string; driveId?: string; parents?: string[]; trashed?: boolean; modifiedTime?: string };
const meta = (id: string): Promise<Meta> => get(`/files/${encodeURIComponent(id)}?supportsAllDrives=true&fields=id,name,mimeType,size,driveId,parents,trashed,modifiedTime`);

/** Only the team's shared drives are browsable, never a personal My Drive. */
function assertShared(m: Meta) {
  if (!m.driveId) throw new Error("Only the Harmonious team's shared drives can be browsed here.");
  if (m.trashed) throw new Error("That item is in the Drive trash.");
}

async function driveName(driveId: string) {
  const d = await get(`/drives/${encodeURIComponent(driveId)}?fields=id,name`).catch(() => null);
  return String(d?.name ?? "Shared drive").trim();
}

async function crumbsFor(m: Meta): Promise<DriveCrumb[]> {
  const out: DriveCrumb[] = [];
  let cur: Meta | null = m;
  for (let i = 0; cur && i < 10; i++) {
    if (cur.id === cur.driveId) { out.unshift({ id: cur.id, name: await driveName(cur.id) }); return out; }
    out.unshift({ id: cur.id, name: cur.name });
    const parent: string | undefined = cur.parents?.[0];
    if (!parent) break;
    if (parent === m.driveId) { out.unshift({ id: parent, name: await driveName(parent) }); return out; }
    cur = await meta(parent).catch(() => null);
  }
  return out;
}

async function children(folderId: string): Promise<DriveEntry[]> {
  const q = `'${driveQueryLiteral(folderId)}' in parents and trashed=false`;
  const data = await get(`/files?q=${encodeURIComponent(q)}&${ALL}&corpora=allDrives&pageSize=300&orderBy=folder,name&fields=${encodeURIComponent("files(id,name,mimeType,size,modifiedTime,driveId)")}`);
  return sortEntries(((data.files ?? []) as Meta[]).filter((f) => f.driveId).map(toEntry));
}

async function sharedDrives(): Promise<DriveEntry[]> {
  const out: DriveEntry[] = [];
  let token = "";
  for (let i = 0; i < 4; i++) {
    const data = await get(`/drives?pageSize=100&fields=nextPageToken,drives(id,name)${token ? `&pageToken=${encodeURIComponent(token)}` : ""}`);
    for (const d of (data.drives ?? []) as { id: string; name: string }[]) out.push({ ...toEntry({ id: d.id, name: String(d.name).trim(), mimeType: FOLDER_MIME }) });
    token = data.nextPageToken ?? "";
    if (!token) break;
  }
  return sortEntries(out);
}

async function investorNames(row: { investment_profile_id: string | null; person_id: string | null }) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const d = supabaseAdmin as any;
  const names: string[] = [];
  if (row.investment_profile_id) {
    const { data: p } = await d.from("investment_profiles").select("legal_name, display_label").eq("id", row.investment_profile_id).maybeSingle();
    for (const n of [p?.legal_name, p?.display_label]) if (n) names.push(String(n));
  }
  if (row.person_id) {
    const { data: p } = await d.from("persons").select("legal_first_name, legal_last_name").eq("id", row.person_id).maybeSingle();
    const n = [p?.legal_first_name, p?.legal_last_name].filter(Boolean).join(" ");
    if (n) names.push(n);
  }
  return [...new Set(names.map((n) => n.trim()).filter((n) => n.length >= 3))].slice(0, 3);
}

/** Where to open: this investor's linked folder, then the fund's Drive folder, then all shared drives. */
async function startFolder(row: { offering_id: string; investment_profile_id: string | null }) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const d = supabaseAdmin as any;
  if (row.investment_profile_id) {
    const { data } = await d.from("drive_folder_mappings").select("folder_id").eq("offering_id", row.offering_id).eq("investment_profile_id", row.investment_profile_id).eq("status", "active").limit(1);
    if (isDriveId(data?.[0]?.folder_id)) return data[0].folder_id as string;
  }
  const { data: o } = await d.from("offerings").select("drive_folder_url").eq("id", row.offering_id).maybeSingle();
  const link = o?.drive_folder_url ? driveIdFromLink(String(o.drive_folder_url)) : null;
  return link?.kind === "folder" ? link.id : null;
}

export type DriveBrowse = { crumbs: DriveCrumb[]; entries: DriveEntry[]; suggestions: DriveEntry[]; searched: string | null; note: string | null };

export async function browseDrive(userId: string, input: { onboardingId: string; folderId?: string | null | undefined; search?: string | null | undefined; start?: boolean | undefined }): Promise<DriveBrowse> {
  const row = await staffOnly(userId, input.onboardingId);
  const term = (input.search ?? "").trim().slice(0, 100);
  if (term) {
    const pasted = driveIdFromLink(term);
    if (pasted) {
      const m = await meta(pasted.id);
      assertShared(m);
      const folder = m.mimeType === FOLDER_MIME ? m : m.parents?.[0] ? await meta(m.parents[0]) : null;
      if (!folder) throw new Error("Couldn't open that link.");
      return { crumbs: await crumbsFor(folder), entries: await children(folder.id), suggestions: [], searched: null, note: null };
    }
    const q = `name contains '${driveQueryLiteral(term)}' and trashed=false`;
    const data = await get(`/files?q=${encodeURIComponent(q)}&${ALL}&corpora=allDrives&pageSize=50&fields=${encodeURIComponent("files(id,name,mimeType,size,modifiedTime,driveId)")}`);
    return { crumbs: [], entries: sortEntries(((data.files ?? []) as Meta[]).filter((f) => f.driveId).map(toEntry)), suggestions: [], searched: term, note: null };
  }

  let folderId = input.folderId ?? null;
  let note: string | null = null;
  let suggestions: DriveEntry[] = [];
  if (input.start) {
    const names = await investorNames(row);
    for (const n of names) {
      const q = `mimeType='${FOLDER_MIME}' and name contains '${driveQueryLiteral(n)}' and trashed=false`;
      const data = await get(`/files?q=${encodeURIComponent(q)}&${ALL}&corpora=allDrives&pageSize=5&fields=${encodeURIComponent("files(id,name,mimeType,driveId)")}`).catch(() => ({ files: [] }));
      for (const f of (data.files ?? []) as Meta[]) if (f.driveId && !suggestions.some((s) => s.id === f.id)) suggestions.push(toEntry(f));
    }
    suggestions = suggestions.slice(0, 5);
    folderId = await startFolder(row);
    if (!folderId) note = "This fund has no Drive folder linked yet, so you're starting at the top.";
  }
  if (!folderId) return { crumbs: [], entries: await sharedDrives(), suggestions, searched: null, note };
  if (!isDriveId(folderId)) throw new Error("That isn't a Drive folder.");
  const m = await meta(folderId).catch((e) => { if (input.start) return null; throw e; });
  if (!m) return { crumbs: [], entries: await sharedDrives(), suggestions, searched: null, note: "The fund's linked Drive folder couldn't be opened, so you're starting at the top." };
  if (m.id !== m.driveId) assertShared(m);
  if (m.mimeType !== FOLDER_MIME && m.id !== m.driveId) throw new Error("That isn't a folder.");
  return { crumbs: m.id === m.driveId ? [{ id: m.id, name: await driveName(m.id) }] : await crumbsFor(m), entries: await children(m.id), suggestions, searched: null, note };
}

/** Download one picked file for the AI reader. Google Docs are exported as PDF. */
export async function downloadDriveFile(userId: string, input: { onboardingId: string; fileId: string }): Promise<{ fileName: string; mimeType: PickMime; base64: string }> {
  await staffOnly(userId, input.onboardingId);
  const m = await meta(input.fileId);
  assertShared(m);
  const r = readableAs(m.mimeType, m.size == null ? null : Number(m.size));
  if (!r.ok) throw new Error(`${m.name}: ${r.why}`);
  const path = m.mimeType === GOOGLE_DOC_MIME
    ? `/files/${encodeURIComponent(m.id)}/export?mimeType=${encodeURIComponent("application/pdf")}`
    : `/files/${encodeURIComponent(m.id)}?alt=media&supportsAllDrives=true`;
  const res = await fetch(`${GATEWAY}${path}`, { headers: headers() });
  if (!res.ok) {
    console.error(`Drive picker download failed [${res.status}]: ${(await res.text().catch(() => "")).slice(0, 300)}`);
    throw serviceError("Google Drive", "download", res.status);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > MAX_PICK_BYTES) throw new Error(`${m.name} is over 10 MB.`);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { fileName: pickedFileName(m.name, m.mimeType), mimeType: r.as, base64: btoa(bin) };
}
