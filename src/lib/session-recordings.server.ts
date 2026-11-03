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

export async function startRecording(userId: string, d: { kind: "replay" | "screen"; path: string; userAgent?: string | undefined }) {
  const db = await admin();
  const id = crypto.randomUUID();
  const prefix = `${d.kind}/${userId}/${id}`;
  const { error } = await db.from("session_recordings").insert({ id, user_id: userId, kind: d.kind, storage_prefix: prefix, first_path: d.path, last_path: d.path, user_agent: d.userAgent?.slice(0, 300) ?? null });
  if (error) throw new Error("Recording couldn't start.");
  if (d.kind === "screen") {
    const up = await db.storage.from(BUCKET).createSignedUploadUrl(`${prefix}/screen.webm`);
    if (up.error) throw new Error("Recording upload couldn't be prepared.");
    return { id, uploadUrl: up.data.signedUrl as string, token: up.data.token as string, path: `${prefix}/screen.webm` };
  }
  return { id };
}

export async function appendReplayChunk(userId: string, d: { id: string; seq: number; path: string; events: string }) {
  const db = await admin();
  const rec = await ownRecording(db, userId, d.id, "replay");
  const body = new TextEncoder().encode(d.events);
  const up = await db.storage.from(BUCKET).upload(`${rec.storage_prefix}/${String(d.seq).padStart(6, "0")}.json`, body, { contentType: "application/json", upsert: true });
  if (up.error) throw new Error("Recording chunk couldn't be saved.");
  await db.from("session_recordings").update({ chunk_count: Math.max(rec.chunk_count, d.seq + 1), bytes: Number(rec.bytes) + body.byteLength, last_path: d.path, last_activity_at: new Date().toISOString() }).eq("id", d.id);
  return { ok: true };
}

export async function finishScreen(userId: string, d: { id: string; note?: string | undefined; bytes: number; path: string }) {
  const db = await admin();
  await ownRecording(db, userId, d.id, "screen");
  await db.from("session_recordings").update({ note: d.note?.slice(0, 2000) || null, bytes: d.bytes, chunk_count: 1, last_path: d.path, last_activity_at: new Date().toISOString() }).eq("id", d.id);
  return { ok: true };
}

async function assertViewer(db: any, userId: string) {
  const { data } = await db.from("user_roles").select("role").eq("user_id", userId);
  if (!((data ?? []) as any[]).some((r) => VIEWER_ROLES.includes(String(r.role)))) throw new Error("Only Harmonious leadership can view recordings.");
}

export async function listRecordings(userId: string, d: { kind?: "replay" | "screen" | undefined; search?: string | undefined }) {
  const db = await admin();
  await assertViewer(db, userId);
  let q = db.from("session_recordings").select("id, user_id, kind, first_path, last_path, chunk_count, bytes, note, started_at, last_activity_at").gt("chunk_count", 0).order("started_at", { ascending: false }).limit(300);
  if (d.kind) q = q.eq("kind", d.kind);
  const { data, error } = await q;
  if (error) throw new Error("Recordings couldn't load.");
  const ids = [...new Set(((data ?? []) as any[]).map((r) => r.user_id))];
  const { data: profs } = ids.length ? await db.from("profiles").select("user_id, legal_name, email").in("user_id", ids) : { data: [] };
  const pm = new Map(((profs ?? []) as any[]).map((p) => [p.user_id, p]));
  let rows = ((data ?? []) as any[]).map((r) => ({ ...r, name: pm.get(r.user_id)?.legal_name || pm.get(r.user_id)?.email || "Unknown person", email: pm.get(r.user_id)?.email ?? null }));
  const s = d.search?.trim().toLowerCase();
  if (s) rows = rows.filter((r) => `${r.name} ${r.email ?? ""} ${r.first_path ?? ""} ${r.last_path ?? ""} ${r.note ?? ""}`.toLowerCase().includes(s));
  return { recordings: rows };
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
    return { kind: "screen" as const, url: s.data.signedUrl as string };
  }
  const events: unknown[] = [];
  for (let i = 0; i < Math.min(rec.chunk_count, 500); i++) {
    const f = await db.storage.from(BUCKET).download(`${rec.storage_prefix}/${String(i).padStart(6, "0")}.json`);
    if (f.error || !f.data) continue;
    try { events.push(...(JSON.parse(await f.data.text()) as unknown[])); } catch { /* skip corrupt chunk */ }
  }
  return { kind: "replay" as const, events: events as any };
}
