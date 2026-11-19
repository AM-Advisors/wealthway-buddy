/** Support recordings. Server-only. Anyone signed in writes only their own; only leadership (super_admin/executive/admin) can list or play. */
const BUCKET = "session-recordings";
const VIEWER_ROLES = ["super_admin", "executive", "admin"];
const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;

async function ownRecording(db: any, userId: string, id: string, kind: "replay" | "screen") {
  const { data, error } = await db.from("session_recordings").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error("Recording couldn't be saved.");
  if (!data || data.user_id !== userId || data.kind !== kind) throw new Error("Recording not found.");
  return data;
}

export async function startRecording(userId: string, d: { kind: "replay" | "screen"; path: string; userAgent?: string | undefined; deviceId?: string | undefined; clientInfo?: Record<string, unknown> | undefined; ip?: string | null; withCamera?: boolean | undefined }) {
  const db = await admin();
  const id = crypto.randomUUID();
  const prefix = `${d.kind}/${userId}/${id}`;
  const { error } = await db.from("session_recordings").insert({ id, user_id: userId, kind: d.kind, storage_prefix: prefix, first_path: d.path, last_path: d.path, user_agent: d.userAgent?.slice(0, 300) ?? null, device_id: d.deviceId ?? null, ip_address: d.ip ?? null, last_ip_address: d.ip ?? null, client_info: d.clientInfo ?? null });
  if (error) throw new Error("Recording couldn't start.");
  if (d.kind === "screen") {
    const up = await db.storage.from(BUCKET).createSignedUploadUrl(`${prefix}/screen.webm`);
    if (up.error) throw new Error("Recording upload couldn't be prepared.");
    let camera: { cameraToken: string; cameraPath: string } | Record<string, never> = {};
    if (d.withCamera) {
      // Only after the person agreed in the recorder; the file holds their own camera and/or microphone.
      const cu = await db.storage.from(BUCKET).createSignedUploadUrl(`${prefix}/camera.webm`);
      if (cu.error) throw new Error("Recording upload couldn't be prepared.");
      camera = { cameraToken: cu.data.token as string, cameraPath: `${prefix}/camera.webm` };
    }
    return { id, uploadUrl: up.data.signedUrl as string, token: up.data.token as string, path: `${prefix}/screen.webm`, ...camera };
  }
  return { id };
}

export async function appendReplayChunk(userId: string, d: { id: string; seq: number; path: string; events: string; ip?: string | null }) {
  const db = await admin();
  const rec = await ownRecording(db, userId, d.id, "replay");
  const body = new TextEncoder().encode(d.events);
  const up = await db.storage.from(BUCKET).upload(`${rec.storage_prefix}/${String(d.seq).padStart(6, "0")}.json`, body, { contentType: "application/json", upsert: true });
  if (up.error) throw new Error("Recording chunk couldn't be saved.");
  await db.from("session_recordings").update({ chunk_count: Math.max(rec.chunk_count, d.seq + 1), bytes: Number(rec.bytes) + body.byteLength, last_path: d.path, last_activity_at: new Date().toISOString(), ...(d.ip ? { last_ip_address: d.ip } : {}) }).eq("id", d.id);
  return { ok: true };
}

export async function finishScreen(userId: string, d: { id: string; note?: string | undefined; bytes: number; path: string }) {
  const db = await admin();
  await ownRecording(db, userId, d.id, "screen");
  await db.from("session_recordings").update({ note: d.note?.slice(0, 2000) || null, bytes: d.bytes, chunk_count: 1, last_path: d.path, last_activity_at: new Date().toISOString() }).eq("id", d.id);
  return { ok: true };
}

const hasCamera = (rec: any) => Boolean(rec?.client_info?.camera || rec?.client_info?.microphone);

async function assertViewer(db: any, userId: string) {
  const { data } = await db.from("user_roles").select("role").eq("user_id", userId);
  if (!((data ?? []) as any[]).some((r) => VIEWER_ROLES.includes(String(r.role)))) throw new Error("Only Harmonious leadership can view recordings.");
}

export async function listRecordings(userId: string, d: { kind?: "replay" | "screen" | undefined; search?: string | undefined }) {
  const db = await admin();
  await assertViewer(db, userId);
  let q = db.from("session_recordings").select("id, user_id, kind, first_path, last_path, chunk_count, bytes, note, started_at, last_activity_at, user_agent, device_id, ip_address, last_ip_address, client_info").gt("chunk_count", 0).order("started_at", { ascending: false }).limit(300);
  if (d.kind) q = q.eq("kind", d.kind);
  const { data, error } = await q;
  if (error) throw new Error("Recordings couldn't load.");
  const ids = [...new Set(((data ?? []) as any[]).map((r) => r.user_id))];
  // Investors keep their verified name in persons, not profiles; share the standard contact lookup.
  const { loadUserContacts } = await import("@/lib/user-contact.server");
  const contacts = await loadUserContacts(db, ids);
  // Older recordings carry no address: use the person's latest recorded sign-in address before it (within 12 hours).
  const recs = (data ?? []) as any[];
  const { ipAt, locate } = await import("@/lib/ip-geo");
  const needFallback = [...new Set(recs.filter((r) => !r.ip_address).map((r) => r.user_id))];
  const points = new Map<string, { at: string; ip: string }[]>();
  if (needFallback.length) {
    const { data: ev } = await db.from("security_events").select("user_id, ip, created_at").in("user_id", needFallback).not("ip", "is", null).order("created_at", { ascending: false }).limit(3000);
    for (const e of (ev ?? []) as any[]) { const l = points.get(e.user_id) ?? []; l.push({ at: e.created_at, ip: e.ip }); points.set(e.user_id, l); }
  }
  const startIp = (r: any) => r.ip_address ? { ip: r.ip_address as string, source: "recorded" as const } : (() => { const p = ipAt(points.get(r.user_id) ?? [], r.started_at); return p ? { ip: p.ip, source: "sign-in" as const } : null; })();
  const starts = new Map(recs.map((r) => [r.id, startIp(r)]));
  const ips = [...new Set([...starts.values()].map((x) => x?.ip).concat(recs.map((r) => r.last_ip_address)).filter(Boolean))] as string[];
  const { placesForIps } = await import("@/lib/ip-geo.server");
  const places = await placesForIps(db, ips, 20);
  const { data: nets } = ips.length ? await db.from("ip_geolocations").select("ip, network").in("ip", ips.slice(0, 500)) : { data: [] };
  const network = new Map(((nets ?? []) as any[]).map((n) => [n.ip, n.network as string | null]));
  let rows = recs.map((r) => {
    const c = contacts.get(r.user_id);
    const st = starts.get(r.id) ?? null;
    const at = st ? locate(r.started_at, st.ip, places) : null;
    const last = r.last_ip_address && r.last_ip_address !== st?.ip ? locate(r.last_activity_at, r.last_ip_address, places) : null;
    const { storage_prefix: _p, ...safe } = r;
    return { ...safe, name: c?.name || c?.email || "Unknown person", email: c?.email ?? null,
      ip: st?.ip ?? null, ipSource: st?.source ?? null, place: at?.place ?? null, timeZone: at?.timeZone ?? null, localStart: at?.localWhen ?? null,
      network: st ? network.get(st.ip) ?? null : null, lastIp: last?.ip ?? null, lastPlace: last?.place ?? null };
  });
  const s = d.search?.trim().toLowerCase();
  if (s) rows = rows.filter((r) => `${r.name} ${r.email ?? ""} ${r.first_path ?? ""} ${r.last_path ?? ""} ${r.note ?? ""} ${r.ip ?? ""} ${r.place ?? ""}`.toLowerCase().includes(s));
  return { recordings: rows };
}

async function loadEvents(db: any, rec: any): Promise<unknown[]> {
  const events: unknown[] = [];
  for (let i = 0; i < Math.min(rec.chunk_count, 500); i++) {
    const f = await db.storage.from(BUCKET).download(`${rec.storage_prefix}/${String(i).padStart(6, "0")}.json`);
    if (f.error || !f.data) continue;
    try { events.push(...(JSON.parse(await f.data.text()) as unknown[])); } catch { /* skip corrupt chunk */ }
  }
  return events;
}

/** Breakdown only (pages, time, clicks, markers); no page content leaves the server. Logged like a view. */
export async function recordingDetails(userId: string, id: string) {
  const db = await admin();
  await assertViewer(db, userId);
  const { data: rec } = await db.from("session_recordings").select("*").eq("id", id).maybeSingle();
  if (!rec) throw new Error("Recording not found.");
  await db.from("security_events").insert({ user_id: userId, event_type: "recording_details_viewed", action: `Viewed details of ${rec.kind} recording ${id}` }).then(() => null, () => null);
  if (rec.kind === "screen") return { kind: "screen" as const, breakdown: null };
  const { recordingBreakdown } = await import("@/lib/recording-details");
  return { kind: "replay" as const, breakdown: recordingBreakdown(await loadEvents(db, rec)) };
}

export async function openRecording(userId: string, id: string) {
  const db = await admin();
  await assertViewer(db, userId);
  const { data: rec } = await db.from("session_recordings").select("*").eq("id", id).maybeSingle();
  if (!rec) throw new Error("Recording not found.");
  await db.from("security_events").insert({ user_id: userId, event_type: "recording_viewed", action: `Viewed ${rec.kind} recording ${id}` }).then(() => null, () => null);
  if (rec.kind === "screen") {
    const s = await db.storage.from(BUCKET).createSignedUrl(`${rec.storage_prefix}/screen.webm`, 600);
    if (s.error) throw new Error("Recording video couldn't open.");
    const c = hasCamera(rec) ? await db.storage.from(BUCKET).createSignedUrl(`${rec.storage_prefix}/camera.webm`, 600) : null;
    return { kind: "screen" as const, url: s.data.signedUrl as string, cameraUrl: (c && !c.error ? c.data.signedUrl : null) as string | null, cameraVideo: Boolean(rec.client_info?.camera) };
  }
  const events: unknown[] = [];
  for (let i = 0; i < Math.min(rec.chunk_count, 500); i++) {
    const f = await db.storage.from(BUCKET).download(`${rec.storage_prefix}/${String(i).padStart(6, "0")}.json`);
    if (f.error || !f.data) continue;
    try { events.push(...(JSON.parse(await f.data.text()) as unknown[])); } catch { /* skip corrupt chunk */ }
  }
  return { kind: "replay" as const, events: events as any };
}

/** Download for leadership viewers; each download is logged separately from viewing. */
export async function downloadRecording(userId: string, id: string) {
  const db = await admin();
  await assertViewer(db, userId);
  const { data: rec } = await db.from("session_recordings").select("*").eq("id", id).maybeSingle();
  if (!rec) throw new Error("Recording not found.");
  await db.from("security_events").insert({ user_id: userId, event_type: "recording_downloaded", action: `Downloaded ${rec.kind} recording ${id}` }).then(() => null, () => null);
  const stamp = String(rec.started_at ?? new Date().toISOString()).slice(0, 16).replace(/[:T]/g, "-");
  const base = `harmonious-${rec.kind === "screen" ? "screen-video" : "page-replay"}-${stamp}`;
  if (rec.kind === "screen") {
    const s = await db.storage.from(BUCKET).createSignedUrl(`${rec.storage_prefix}/screen.webm`, 120, { download: `${base}.webm` });
    if (s.error) throw new Error("Recording video couldn't be downloaded.");
    const c = hasCamera(rec) ? await db.storage.from(BUCKET).createSignedUrl(`${rec.storage_prefix}/camera.webm`, 120, { download: `${base}-${rec.client_info?.camera ? "camera" : "microphone"}.webm` }) : null;
    return { kind: "screen" as const, url: s.data.signedUrl as string, cameraUrl: (c && !c.error ? c.data.signedUrl : null) as string | null, fileName: `${base}.webm` };
  }
  const events: unknown[] = [];
  for (let i = 0; i < Math.min(rec.chunk_count, 500); i++) {
    const f = await db.storage.from(BUCKET).download(`${rec.storage_prefix}/${String(i).padStart(6, "0")}.json`);
    if (f.error || !f.data) continue;
    try { events.push(...(JSON.parse(await f.data.text()) as unknown[])); } catch { /* skip corrupt chunk */ }
  }
  return { kind: "replay" as const, events: events as any, fileName: `${base}.html` };
}
