/**
 * Marketing Google Drive library: syncs one Marketing folder (read-only), lets the Marketing team
 * use its images/themes in posts, emails and campaigns, and share marketing sheets through tracked,
 * revocable links. Never writes to Drive. Folders that look like contact lists are skipped.
 */
import { randomBytes } from "node:crypto";
import { requireMarketing } from "@/lib/marketing.server";

export const MARKETING_DRIVE_FOLDER = "1wEJQPGaLaPytBneFvvEFOqeFFJ5H4C3T";
const BUCKET = "marketing-assets";
const SITE = "https://app.harmonious.co";
const SKIP_FOLDER = /contact|signature|fonts?$|working/i;
const FOLDER = "application/vnd.google-apps.folder";
const EXPORT_PDF: Record<string, string> = {
  "application/vnd.google-apps.document": "application/pdf",
  "application/vnd.google-apps.presentation": "application/pdf",
  "application/vnd.google-apps.spreadsheet": "application/pdf",
};
const MAX_BYTES = 25 * 1024 * 1024;

function kindOf(mime: string): "image" | "sheet" | "video" | "other" {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime === "application/pdf" || EXPORT_PDF[mime]) return "sheet";
  return "other";
}

async function drive() { return import("@/lib/drive.server"); }

async function writable(userId: string) {
  const ctx = await requireMarketing(userId);
  if (ctx.roles.length && ctx.roles.every((r) => r === "leadership")) throw new Error("Leadership has view-only access.");
  return ctx;
}

/** Walk the Marketing folder and upsert every file. Files no longer present are marked removed (never deleted). */
export async function syncMarketingDrive(userId: string | null) {
  if (userId) await writable(userId);
  const db = (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
  const { call } = await drive();
  const queue: { id: string; path: string; theme: string | null }[] = [{ id: MARKETING_DRIVE_FOLDER, path: "", theme: null }];
  const seen = new Set<string>();
  let files = 0, folders = 0;
  const now = new Date().toISOString();
  while (queue.length && folders < 400) {
    const f = queue.shift()!;
    folders++;
    let pageToken: string | undefined;
    do {
      const q = encodeURIComponent(`'${f.id}' in parents and trashed=false`);
      const fields = encodeURIComponent("nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink)");
      const r: any = await call(`/drive/v3/files?q=${q}&fields=${fields}&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true${pageToken ? `&pageToken=${pageToken}` : ""}`);
      const rows: any[] = [];
      for (const x of (r.files ?? []) as any[]) {
        if (x.mimeType === FOLDER) {
          if (!SKIP_FOLDER.test(x.name)) queue.push({ id: x.id, path: f.path ? `${f.path} / ${x.name}` : x.name, theme: f.theme ?? x.name });
          continue;
        }
        seen.add(x.id);
        rows.push({
          drive_file_id: x.id, name: x.name, mime_type: x.mimeType, kind: kindOf(x.mimeType), theme: f.theme,
          folder_path: f.path, web_view_link: x.webViewLink ?? null, size_bytes: x.size ? Number(x.size) : null,
          drive_modified_at: x.modifiedTime ?? null, removed_at: null, synced_at: now,
        });
      }
      if (rows.length) {
        const { error } = await db.from("marketing_drive_assets").upsert(rows, { onConflict: "drive_file_id" });
        if (error) throw new Error(error.message);
        files += rows.length;
      }
      pageToken = r.nextPageToken;
    } while (pageToken);
  }
  // Mark files that disappeared from Drive as removed.
  const { data: existing } = await db.from("marketing_drive_assets").select("id, drive_file_id").is("removed_at", null).limit(20000);
  const gone = ((existing ?? []) as any[]).filter((a) => !seen.has(a.drive_file_id)).map((a) => a.id);
  for (let i = 0; i < gone.length; i += 200) await db.from("marketing_drive_assets").update({ removed_at: now }).in("id", gone.slice(i, i + 200));
  return { files, folders, removed: gone.length };
}

/** Copy one Drive file into Harmonious storage (cached until Drive changes). Google files export as PDF. */
async function ensureCached(db: any, a: any): Promise<string> {
  if (a.storage_path && a.cached_modified_at && a.drive_modified_at && a.cached_modified_at >= a.drive_modified_at) return a.storage_path;
  const { GATEWAY, headers } = await drive();
  const exp = EXPORT_PDF[a.mime_type];
  const path = exp
    ? `/drive/v3/files/${encodeURIComponent(a.drive_file_id)}/export?mimeType=${encodeURIComponent(exp)}`
    : `/drive/v3/files/${encodeURIComponent(a.drive_file_id)}?alt=media&supportsAllDrives=true`;
  const res = await fetch(`${GATEWAY}${path}`, { headers: headers() });
  if (!res.ok) throw new Error(`Google Drive download failed [${res.status}]: ${(await res.text()).slice(0, 200)}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error("This file is over 25 MB; share it from Drive instead.");
  const type = exp ?? a.mime_type;
  const ext = exp ? ".pdf" : "";
  const storagePath = `drive/${a.id}/${String(a.name).replace(/[^\w.-]/g, "_").slice(-80)}${ext}`;
  const { error } = await db.storage.from(BUCKET).upload(storagePath, buf, { contentType: type, upsert: true });
  if (error) throw new Error(error.message);
  await db.from("marketing_drive_assets").update({ storage_path: storagePath, cached_modified_at: a.drive_modified_at ?? new Date().toISOString() }).eq("id", a.id);
  return storagePath;
}

export async function listMarketingAssets(userId: string, f: { kind?: string | null | undefined; theme?: string | null | undefined; search?: string | null | undefined }) {
  const { db } = await requireMarketing(userId);
  let q = db.from("marketing_drive_assets").select("id, name, mime_type, kind, theme, folder_path, web_view_link, drive_modified_at, storage_path, synced_at").is("removed_at", null).order("drive_modified_at", { ascending: false }).limit(300);
  if (f.kind) q = q.eq("kind", f.kind);
  if (f.theme) q = q.eq("theme", f.theme);
  if (f.search) q = q.ilike("name", `%${f.search.replace(/[%_]/g, "")}%`);
  const [{ data }, { data: themes }, { data: last }] = await Promise.all([
    q,
    db.from("marketing_drive_assets").select("theme").is("removed_at", null).not("theme", "is", null).limit(20000),
    db.from("marketing_drive_assets").select("synced_at").order("synced_at", { ascending: false }).limit(1),
  ]);
  const rows = (data ?? []) as any[];
  const cached = rows.filter((r) => r.storage_path && r.kind === "image");
  const { data: urls } = cached.length ? await db.storage.from(BUCKET).createSignedUrls(cached.map((r) => r.storage_path), 3600) : { data: [] };
  const urlBy = new Map(cached.map((r, i) => [r.id, (urls as any[])?.[i]?.signedUrl ?? null]));
  const counts = new Map<string, number>();
  for (const t of (themes ?? []) as any[]) counts.set(t.theme, (counts.get(t.theme) ?? 0) + 1);
  return {
    lastSyncedAt: ((last ?? []) as any[])[0]?.synced_at ?? null,
    themes: [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, count]) => ({ name, count })),
    assets: rows.map((r) => ({ id: r.id as string, name: r.name as string, kind: r.kind as string, theme: r.theme as string | null, path: r.folder_path as string, driveUrl: r.web_view_link as string | null, modifiedAt: r.drive_modified_at as string | null, previewUrl: (urlBy.get(r.id) as string | null) ?? null })),
  };
}

/** Load previews for a page of images (copies them into storage once). */
export async function loadPreviews(userId: string, ids: string[]) {
  const { db } = await requireMarketing(userId);
  const { data } = await db.from("marketing_drive_assets").select("*").in("id", ids.slice(0, 24)).eq("kind", "image");
  const out: Record<string, string> = {};
  for (const a of (data ?? []) as any[]) {
    try {
      const p = await ensureCached(db, a);
      const { data: s } = await db.storage.from(BUCKET).createSignedUrl(p, 3600);
      if (s?.signedUrl) out[a.id] = s.signedUrl;
    } catch (e) { console.error("preview", a.id, e); }
  }
  return out;
}

/** Use a Drive image in a post or email: returns a storage path (posts) and a long-lived URL (email image blocks). */
export async function useDriveImage(userId: string, assetId: string) {
  const { db } = await writable(userId);
  const { data: a } = await db.from("marketing_drive_assets").select("*").eq("id", assetId).is("removed_at", null).maybeSingle();
  if (!a) throw new Error("That file is no longer in the Marketing folder.");
  if (a.kind !== "image") throw new Error("Pick an image.");
  const path = await ensureCached(db, a);
  const { data: s } = await db.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 24 * 365);
  return { path, url: (s?.signedUrl as string) ?? "" };
}

/* ---------- Campaign themes / mood board ---------- */
export async function campaignAssets(userId: string, campaignId: string) {
  const { db } = await requireMarketing(userId);
  const { data } = await db.from("marketing_campaign_assets").select("id, asset_id, note, marketing_drive_assets(id, name, kind, theme, storage_path, web_view_link)").eq("campaign_id", campaignId).order("created_at");
  const rows = (data ?? []) as any[];
  const paths = rows.map((r) => r.marketing_drive_assets?.storage_path).filter(Boolean);
  const { data: urls } = paths.length ? await db.storage.from(BUCKET).createSignedUrls(paths, 3600) : { data: [] };
  const byPath = new Map(((urls ?? []) as any[]).map((u, i) => [paths[i], u.signedUrl]));
  return rows.map((r) => ({ id: r.id as string, assetId: r.asset_id as string, name: r.marketing_drive_assets?.name ?? "File", kind: r.marketing_drive_assets?.kind ?? "other", theme: r.marketing_drive_assets?.theme ?? null, driveUrl: r.marketing_drive_assets?.web_view_link ?? null, previewUrl: byPath.get(r.marketing_drive_assets?.storage_path) ?? null }));
}
export async function addCampaignAsset(userId: string, campaignId: string, assetId: string) {
  const { db } = await writable(userId);
  const { data: a } = await db.from("marketing_drive_assets").select("*").eq("id", assetId).maybeSingle();
  if (!a) throw new Error("File not found.");
  if (a.kind === "image") await ensureCached(db, a).catch(() => null);
  const { error } = await db.from("marketing_campaign_assets").upsert({ campaign_id: campaignId, asset_id: assetId, added_by: userId }, { onConflict: "campaign_id,asset_id" });
  if (error) throw new Error(error.message);
  return { ok: true };
}
export async function removeCampaignAsset(userId: string, id: string) {
  const { db } = await writable(userId);
  await db.from("marketing_campaign_assets").delete().eq("id", id);
  return { ok: true };
}

/* ---------- Marketing sheets: tracked share links ---------- */
export async function createShareLink(userId: string, d: { assetId: string; audience: string; recipientName?: string | null | undefined; recipientEmail?: string | null | undefined }) {
  const { db } = await writable(userId);
  const { data: a } = await db.from("marketing_drive_assets").select("*").eq("id", d.assetId).is("removed_at", null).maybeSingle();
  if (!a) throw new Error("That file is no longer in the Marketing folder.");
  if (a.kind !== "sheet" && a.kind !== "image") throw new Error("Only PDFs, Google Docs/Slides/Sheets and images can be shared.");
  await ensureCached(db, a);
  const token = randomBytes(24).toString("base64url");
  const { error } = await db.from("marketing_share_links").insert({ token, asset_id: a.id, audience: d.audience, recipient_name: d.recipientName || null, recipient_email: d.recipientEmail || null, created_by: userId });
  if (error) throw new Error(error.message);
  return { url: `${SITE}/api/public/m/${token}` };
}
export async function listShareLinks(userId: string) {
  const { db } = await requireMarketing(userId);
  const { data: links } = await db.from("marketing_share_links").select("id, token, asset_id, audience, recipient_name, recipient_email, created_by, revoked_at, created_at, marketing_drive_assets(name)").order("created_at", { ascending: false }).limit(300);
  const ids = ((links ?? []) as any[]).map((l) => l.id);
  const { data: views } = ids.length ? await db.from("marketing_share_views").select("link_id, viewed_at").in("link_id", ids).limit(20000) : { data: [] };
  const v = new Map<string, { n: number; last: string | null }>();
  for (const x of (views ?? []) as any[]) { const c = v.get(x.link_id) ?? { n: 0, last: null }; c.n++; if (!c.last || x.viewed_at > c.last) c.last = x.viewed_at; v.set(x.link_id, c); }
  return ((links ?? []) as any[]).map((l) => ({ id: l.id as string, url: `${SITE}/api/public/m/${l.token}`, fileName: l.marketing_drive_assets?.name ?? "File", audience: l.audience as string, recipient: l.recipient_name || l.recipient_email || null, revoked: !!l.revoked_at, createdAt: l.created_at as string, views: v.get(l.id)?.n ?? 0, lastViewedAt: v.get(l.id)?.last ?? null }));
}
export async function revokeShareLink(userId: string, id: string) {
  const { db } = await writable(userId);
  await db.from("marketing_share_links").update({ revoked_at: new Date().toISOString(), revoked_by: userId }).eq("id", id).is("revoked_at", null);
  return { ok: true };
}
/** Public: record a view and return a short-lived download URL. */
export async function openShareLink(token: string, userAgent: string | null) {
  const db = (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
  const { data: l } = await db.from("marketing_share_links").select("id, revoked_at, asset_id").eq("token", token).maybeSingle();
  if (!l || l.revoked_at) return null;
  const { data: a } = await db.from("marketing_drive_assets").select("*").eq("id", l.asset_id).maybeSingle();
  if (!a || a.removed_at) return null;
  const path = await ensureCached(db, a);
  await db.from("marketing_share_views").insert({ link_id: l.id, user_agent: userAgent?.slice(0, 300) ?? null });
  const { data: s } = await db.storage.from(BUCKET).createSignedUrl(path, 300);
  return (s?.signedUrl as string) ?? null;
}

/** Email attachments: signed URLs (24h) for the scheduler to hand to the email provider. */
export async function attachmentsFor(db: any, ids: string[]) {
  if (!ids?.length) return [] as { url: string; name: string }[];
  const { data } = await db.from("marketing_drive_assets").select("*").in("id", ids).is("removed_at", null);
  const out: { url: string; name: string }[] = [];
  for (const a of (data ?? []) as any[]) {
    const p = await ensureCached(db, a);
    const { data: s } = await db.storage.from(BUCKET).createSignedUrl(p, 86400);
    if (s?.signedUrl) out.push({ url: s.signedUrl, name: EXPORT_PDF[a.mime_type] ? `${String(a.name).replace(/\.\w+$/, "")}.pdf` : a.name });
  }
  return out;
}
