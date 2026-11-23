import { canShareRecording, isShareToken, isRepeatView, shareExpiry, shareState, shareUrl } from "@/lib/video-share";
/** Shared screen-video links. Leadership (same roles that may view recordings) creates and turns off links; every viewing is saved. */
const BUCKET = "session-recordings";
const VIEWER_ROLES = ["super_admin", "executive", "admin"];
const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
const origin = async () => (await import("@/lib/account-invite.server")).PORTAL_ORIGIN;
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function assertViewer(db: any, userId: string) {
  const { data } = await db.from("user_roles").select("role").eq("user_id", userId);
  if (!((data ?? []) as any[]).some((r) => VIEWER_ROLES.includes(String(r.role)))) throw new Error("Only Harmonious leadership can share recordings.");
}

async function screenRecording(db: any, id: string) {
  const { data: rec } = await db.from("session_recordings").select("id, kind, storage_prefix, client_info").eq("id", id).maybeSingle();
  if (!rec) throw new Error("Recording not found.");
  if (!canShareRecording(rec.kind)) throw new Error("Only screen videos can be shared. Page replays stay private.");
  return rec;
}

const hasCamera = (rec: any) => Boolean(rec?.client_info?.camera || rec?.client_info?.microphone);

export async function shareStatus(userId: string, recordingId: string) {
  const db = await admin();
  await assertViewer(db, userId);
  const rec = await screenRecording(db, recordingId);
  const [{ data: links }, { data: views }] = await Promise.all([
    db.from("video_share_links").select("id, token, include_camera, expires_at, revoked_at, view_count, last_viewed_at, created_at").eq("recording_id", recordingId).order("created_at", { ascending: false }).limit(20),
    db.from("video_share_views").select("id, link_id, viewer_name, viewer_email, viewed_at, ip_address, user_agent").eq("recording_id", recordingId).order("viewed_at", { ascending: false }).limit(300),
  ]);
  const active = ((links ?? []) as any[]).find((l) => shareState(l) === "active") ?? null;
  const base = await origin();
  return {
    hasCamera: hasCamera(rec), cameraVideo: Boolean(rec.client_info?.camera),
    active: active ? { id: active.id, url: shareUrl(base, active.token), includeCamera: active.include_camera, expiresAt: active.expires_at, createdAt: active.created_at, viewCount: active.view_count, lastViewedAt: active.last_viewed_at } : null,
    views: ((views ?? []) as any[]).map((v) => ({ ...v, current: Boolean(active && v.link_id === active.id) })),
  };
}

/** Makes the video's link, replacing any earlier one (the earlier link stops working). */
export async function createShareLink(userId: string, d: { recordingId: string; includeCamera: boolean }) {
  const db = await admin();
  await assertViewer(db, userId);
  const rec = await screenRecording(db, d.recordingId);
  const now = new Date().toISOString();
  await db.from("video_share_links").update({ revoked_at: now }).eq("recording_id", rec.id).is("revoked_at", null);
  const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const { error } = await db.from("video_share_links").insert({ recording_id: rec.id, token, include_camera: d.includeCamera && hasCamera(rec), expires_at: shareExpiry(), created_by: userId });
  if (error) throw new Error("The share link couldn't be made. Please try again.");
  await db.from("security_events").insert({ user_id: userId, event_type: "recording_share_created", action: `Made a share link for screen recording ${rec.id}${d.includeCamera && hasCamera(rec) ? " (with camera/microphone)" : ""}` }).then(() => null, () => null);
  return { url: shareUrl(await origin(), token) };
}

export async function cancelShareLink(userId: string, recordingId: string) {
  const db = await admin();
  await assertViewer(db, userId);
  await db.from("video_share_links").update({ revoked_at: new Date().toISOString() }).eq("recording_id", recordingId).is("revoked_at", null);
  await db.from("security_events").insert({ user_id: userId, event_type: "recording_share_cancelled", action: `Turned off the share link for screen recording ${recordingId}` }).then(() => null, () => null);
  return { ok: true };
}

/** Public: finds a link by its code. Returns null for unknown codes. */
export async function linkForToken(token: string) {
  if (!isShareToken(token)) return null;
  const db = await admin();
  const { data } = await db.from("video_share_links").select("*").eq("token", token).maybeSingle();
  return data ?? null;
}

/** Public: saves the viewing, then returns short-lived addresses for the video (and camera only when the link includes it). */
export async function watchShared(link: any, viewer: { name: string; email: string; ip: string | null; userAgent: string | null }) {
  const db = await admin();
  const rec = await screenRecording(db, link.recording_id);
  const { data: prev } = await db.from("video_share_views").select("viewer_email, ip_address, viewed_at").eq("link_id", link.id).eq("viewer_email", viewer.email).order("viewed_at", { ascending: false }).limit(1).maybeSingle();
  if (!isRepeatView(prev, viewer.email, viewer.ip)) {
    const { error } = await db.from("video_share_views").insert({ link_id: link.id, recording_id: rec.id, viewer_name: viewer.name, viewer_email: viewer.email, ip_address: viewer.ip, user_agent: viewer.userAgent?.slice(0, 300) ?? null });
    if (error) throw new Error("We couldn't open the video. Please try again.");
    await db.from("video_share_links").update({ view_count: (link.view_count ?? 0) + 1, last_viewed_at: new Date().toISOString() }).eq("id", link.id);
  }
  const s = await db.storage.from(BUCKET).createSignedUrl(`${rec.storage_prefix}/screen.webm`, 4 * 3600);
  if (s.error) throw new Error("We couldn't open the video. Please try again.");
  const c = link.include_camera && hasCamera(rec) ? await db.storage.from(BUCKET).createSignedUrl(`${rec.storage_prefix}/camera.webm`, 4 * 3600) : null;
  return { url: s.data.signedUrl as string, cameraUrl: (c && !c.error ? c.data.signedUrl : null) as string | null, cameraVideo: Boolean(rec.client_info?.camera) };
}
