/**
 * Tech workspace engine (server-only). Anyone signed in reports bugs and ideas and sees only their own;
 * Harmonious staff view the inbox, backlog, roadmap, caught errors and release notes; Super Admin,
 * Product Reviewers and the Tech team change them. Nothing is deleted; every change is logged.
 */
import { canManageTech, errorFingerprint, feedbackTextProblem, groupErrors, reporterStatus, shouldAlertError, triageProblem, type FeedbackStatus, type RoadmapColumn, type TriageAction } from "@/lib/tech-model";
import { STAFF_ROLE_SET } from "@/lib/staff-directory.server";

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
const BUCKET = "tech-feedback";

async function who(userId: string) {
  const db = await admin();
  const [{ data: roleRows }, { data: members }] = await Promise.all([
    db.from("user_roles").select("role").eq("user_id", userId),
    db.from("client_users").select("client_id").eq("user_id", userId).is("revoked_at", null).limit(1),
  ]);
  const roles = ((roleRows ?? []) as any[]).map((r) => String(r.role));
  const staff = roles.some((r) => STAFF_ROLE_SET.includes(r));
  const audience: "staff" | "client" | "investor" = staff ? "staff" : (members ?? []).length ? "client" : "investor";
  return { db, roles, staff, audience, manage: staff && canManageTech(roles) };
}
async function staffOnly(userId: string) {
  const w = await who(userId);
  if (!w.staff) throw new Error("The Tech workspace is for Harmonious staff.");
  return w;
}
async function managerOnly(userId: string) {
  const w = await staffOnly(userId);
  if (!w.manage) throw new Error("Only Super Admin, Product Reviewers and the Tech team can change the Tech workspace.");
  return w;
}
async function log(db: any, subjectType: string, subjectId: string, actorId: string | null, event: string, detail: Record<string, unknown> = {}) {
  const { error } = await db.from("tech_events").insert({ subject_type: subjectType, subject_id: subjectId, actor_id: actorId, event, detail });
  if (error) console.error("tech event", error.message);
}
async function names(db: any, ids: (string | null | undefined)[]) {
  const u = [...new Set(ids.filter((x): x is string => !!x))];
  if (!u.length) return new Map<string, string>();
  const { data } = await db.from("profiles").select("user_id, legal_name, email").in("user_id", u);
  return new Map(((data ?? []) as any[]).map((p) => [p.user_id, p.legal_name || p.email || "Someone"]));
}

// ------------------------------------------------------------ Reporting (everyone)

export async function submitFeedback(userId: string, d: { kind: "bug" | "idea"; title: string; details: string; page?: string | null | undefined; browser?: string | null | undefined; screenshot?: { name: string; type: string; base64: string } | null | undefined }) {
  const w = await who(userId);
  const p = feedbackTextProblem(d.title, d.details);
  if (p) throw new Error(p);
  const page = (d.page ?? "").split(/[?#]/)[0]?.slice(0, 300) || null;
  let screenshot: string | null = null;
  if (d.screenshot) {
    if (!/^image\/(png|jpeg|webp|gif)$/.test(d.screenshot.type)) throw new Error("Screenshots must be an image (PNG, JPG, WebP or GIF).");
    const bytes = Uint8Array.from(atob(d.screenshot.base64), (c) => c.charCodeAt(0));
    if (bytes.byteLength > 5 * 1024 * 1024) throw new Error("Screenshots can be up to 5 MB.");
    screenshot = `${userId}/${crypto.randomUUID()}.${d.screenshot.type.split("/")[1]}`;
    const { error } = await w.db.storage.from(BUCKET).upload(screenshot, bytes, { contentType: d.screenshot.type });
    if (error) throw new Error("The screenshot couldn't be saved. Try again or send without it.");
  }
  const { data, error } = await w.db.from("tech_feedback").insert({
    reporter_user_id: userId, audience: w.audience, kind: d.kind, title: d.title.trim(), details: d.details.trim(), page, browser: (d.browser ?? "").slice(0, 300) || null, screenshot_path: screenshot,
  }).select("id").single();
  if (error) throw new Error("Your report couldn't be saved. Try again.");
  await log(w.db, "feedback", data.id, userId, "submitted", { kind: d.kind });
  const { notifyTech } = await import("@/lib/ops-slack-notify.server");
  await notifyTech({ key: `feedback:${data.id}`, head: d.kind === "bug" ? "New bug report" : "New idea", title: d.title.trim().slice(0, 150), context: `From a ${w.audience === "staff" ? "Harmonious team member" : w.audience}${page ? ` · ${page}` : ""}`, path: `/ops/tech?tab=inbox` });
  return { id: data.id as string };
}

export async function myFeedback(userId: string) {
  const w = await who(userId);
  const { data, error } = await w.db.from("tech_feedback").select("id, kind, title, details, page, status, status_note, backlog_item_id, merged_into, created_at, updated_at").eq("reporter_user_id", userId).order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error("Your reports couldn't load.");
  const rows = (data ?? []) as any[];
  const ids = [...new Set(rows.map((r) => r.backlog_item_id).filter(Boolean))];
  const { data: items } = ids.length ? await w.db.from("tech_backlog_items").select("id, roadmap_column").in("id", ids) : { data: [] };
  const col = new Map(((items ?? []) as any[]).map((i) => [i.id, i.roadmap_column as RoadmapColumn]));
  let notesQ = w.db.from("tech_release_notes").select("id, title, body, audience, published_at").not("published_at", "is", null).order("published_at", { ascending: false }).limit(20);
  if (!w.staff) notesQ = notesQ.eq("audience", "clients");
  const { data: notes } = await notesQ;
  return {
    staff: w.staff,
    reports: rows.map((r) => ({ id: r.id, kind: r.kind, title: r.title, details: r.details, page: r.page, createdAt: r.created_at, updatedAt: r.updated_at,
      statusLabel: reporterStatus(r.status as FeedbackStatus, r.backlog_item_id ? col.get(r.backlog_item_id) ?? null : null), status: r.status,
      note: ["needs_info", "not_planned"].includes(r.status) ? r.status_note : null })),
    whatsNew: ((notes ?? []) as any[]).map((n) => ({ id: n.id, title: n.title, body: n.body, publishedAt: n.published_at })),
  };
}

export async function screenshotLink(userId: string, feedbackId: string) {
  const w = await who(userId);
  const { data: f } = await w.db.from("tech_feedback").select("reporter_user_id, screenshot_path").eq("id", feedbackId).maybeSingle();
  if (!f?.screenshot_path || (f.reporter_user_id !== userId && !w.staff)) throw new Error("Screenshot not found.");
  const { data, error } = await w.db.storage.from(BUCKET).createSignedUrl(f.screenshot_path, 300);
  if (error) throw new Error("The screenshot couldn't open.");
  return { url: data.signedUrl as string };
}

// ------------------------------------------------------------ Workspace (staff)

export async function techWorkspace(userId: string) {
  const w = await staffOnly(userId);
  const db = w.db;
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const [fb, bl, notes, noteItems, issues, errs] = await Promise.all([
    db.from("tech_feedback").select("*").order("created_at", { ascending: false }).limit(500),
    db.from("tech_backlog_items").select("*").order("updated_at", { ascending: false }).limit(1000),
    db.from("tech_release_notes").select("*").order("created_at", { ascending: false }).limit(100),
    db.from("tech_release_note_items").select("note_id, backlog_item_id"),
    db.from("software_issues").select("id, title, stage, created_at").neq("stage", "resolved").order("created_at", { ascending: false }).limit(200),
    db.from("security_events").select("action, path, created_at, user_id").eq("event_type", "client_error").gte("created_at", since).order("created_at", { ascending: false }).limit(5000),
  ]);
  for (const r of [fb, bl, notes, noteItems, issues]) if (r.error) throw new Error("The Tech workspace couldn't load.");
  const feedback = (fb.data ?? []) as any[];
  const backlog = (bl.data ?? []) as any[];
  const nm = await names(db, [...feedback.map((f) => f.reporter_user_id), ...backlog.map((b) => b.created_by), ...((notes.data ?? []) as any[]).flatMap((n) => [n.created_by, n.published_by])]);
  const groups = groupErrors((errs.data ?? []) as any[]);
  const promoted = new Map(backlog.filter((b) => b.source === "error").map((b) => [b.source_ref, b.id]));
  // Spike alerts, once per error group per hour.
  const spikes = groups.filter(shouldAlertError);
  if (spikes.length) {
    const { notifyTech } = await import("@/lib/ops-slack-notify.server");
    const hour = new Date().toISOString().slice(0, 13);
    await Promise.all(spikes.slice(0, 5).map((g) => notifyTech({ key: `${g.fingerprint}:${hour}`, head: "Error spike", title: `${g.message} on ${g.page}`, context: `${g.lastHour} times in the last hour · ${g.people} people`, path: "/ops/tech?tab=errors" })));
  }
  const reportsFor = new Map<string, number>();
  for (const f of feedback) if (f.backlog_item_id) reportsFor.set(f.backlog_item_id, (reportsFor.get(f.backlog_item_id) ?? 0) + 1);
  const items = (noteItems.data ?? []) as any[];
  return {
    canManage: w.manage,
    feedback: feedback.map((f) => ({ id: f.id, kind: f.kind, audience: f.audience, title: f.title, details: f.details, page: f.page, browser: f.browser, hasScreenshot: !!f.screenshot_path, status: f.status, statusNote: f.status_note, backlogItemId: f.backlog_item_id, mergedInto: f.merged_into, reporterName: nm.get(f.reporter_user_id) ?? "Someone", createdAt: f.created_at })),
    backlog: backlog.map((b) => ({ id: b.id, kind: b.kind, title: b.title, summary: b.summary, priority: b.priority, area: b.area, roadmapColumn: b.roadmap_column, targetMonth: b.target_month, source: b.source, softwareIssueId: b.software_issue_id, customServiceId: b.custom_service_id, reports: reportsFor.get(b.id) ?? 0, updatedAt: b.updated_at, createdAt: b.created_at })),
    softwareIssues: ((issues.data ?? []) as any[]).map((i) => ({ id: i.id, title: i.title, stage: i.stage, onBacklog: backlog.some((b) => b.software_issue_id === i.id) })),
    errors: groups.slice(0, 200).map((g) => ({ ...g, backlogItemId: promoted.get(g.fingerprint) ?? null })),
    releaseNotes: ((notes.data ?? []) as any[]).map((n) => ({ id: n.id, title: n.title, body: n.body, audience: n.audience, createdAt: n.created_at, publishedAt: n.published_at, publishedByName: n.published_by ? nm.get(n.published_by) ?? "Someone" : null, createdByName: nm.get(n.created_by) ?? "Someone", itemIds: items.filter((x) => x.note_id === n.id).map((x) => x.backlog_item_id) })),
  };
}

type BacklogInput = { kind: "bug" | "enhancement"; title: string; summary?: string | undefined; priority?: string | undefined; area?: string | undefined; roadmapColumn?: string | undefined; targetMonth?: string | null | undefined };
const backlogRow = (d: BacklogInput) => ({ kind: d.kind, title: d.title.trim().slice(0, 200), summary: (d.summary ?? "").trim().slice(0, 4000), priority: d.priority ?? "normal", area: (d.area ?? "general").slice(0, 60), roadmap_column: d.roadmapColumn ?? "later", target_month: d.targetMonth || null });

export async function triageFeedback(userId: string, d: { id: string; action: TriageAction; note?: string | null | undefined; mergeInto?: string | null | undefined; backlogItemId?: string | null | undefined; newItem?: BacklogInput | null | undefined }) {
  const w = await managerOnly(userId);
  const { data: f } = await w.db.from("tech_feedback").select("*").eq("id", d.id).maybeSingle();
  if (!f) throw new Error("Report not found.");
  const problem = triageProblem({ roles: w.roles, status: f.status, action: d.action, note: d.note, mergeInto: d.mergeInto, selfId: f.id });
  if (problem) throw new Error(problem);
  const note = (d.note ?? "").trim().slice(0, 2000) || null;
  const p = feedbackTextProblem(note);
  if (p) throw new Error(p);
  let patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (d.action === "accept") {
    let itemId = d.backlogItemId ?? null;
    if (itemId) {
      const { data: it } = await w.db.from("tech_backlog_items").select("id").eq("id", itemId).maybeSingle();
      if (!it) throw new Error("Backlog item not found.");
    } else {
      const item = d.newItem ?? { kind: f.kind === "bug" ? "bug" : "enhancement", title: f.title, summary: f.details };
      const { data: created, error } = await w.db.from("tech_backlog_items").insert({ ...backlogRow(item as BacklogInput), source: "feedback", source_ref: `feedback:${f.id}`, created_by: userId }).select("id").single();
      if (error) throw new Error("Couldn't add it to the backlog.");
      itemId = created.id;
      await log(w.db, "backlog", itemId!, userId, "created", { from: "feedback", feedbackId: f.id });
    }
    patch = { ...patch, status: "accepted", backlog_item_id: itemId, status_note: note };
  } else if (d.action === "merge") {
    const { data: target } = await w.db.from("tech_feedback").select("id, backlog_item_id, status").eq("id", d.mergeInto).maybeSingle();
    if (!target) throw new Error("The report to combine with wasn't found.");
    patch = { ...patch, status: "merged", merged_into: target.id, backlog_item_id: target.backlog_item_id ?? null, status_note: note };
  } else {
    patch = { ...patch, status: d.action, status_note: note };
  }
  const { error } = await w.db.from("tech_feedback").update(patch).eq("id", f.id).eq("updated_at", f.updated_at);
  if (error) throw new Error("Couldn't save the decision.");
  await log(w.db, "feedback", f.id, userId, d.action, { note, mergeInto: d.mergeInto ?? null, backlogItemId: patch["backlog_item_id"] ?? null, previous: f.status });
  return { ok: true };
}

export async function saveBacklogItem(userId: string, d: BacklogInput & { id?: string | null | undefined; expectedUpdatedAt?: string | null | undefined }) {
  const w = await managerOnly(userId);
  const p = feedbackTextProblem(d.title, d.summary);
  if (p) throw new Error(p);
  const row = backlogRow(d);
  if (!d.id) {
    const { data, error } = await w.db.from("tech_backlog_items").insert({ ...row, source: "staff", created_by: userId }).select("id").single();
    if (error) throw new Error("Couldn't add the item.");
    await log(w.db, "backlog", data.id, userId, "created", row);
    return { id: data.id as string };
  }
  const { data: before } = await w.db.from("tech_backlog_items").select("*").eq("id", d.id).maybeSingle();
  if (!before) throw new Error("Backlog item not found.");
  if (d.expectedUpdatedAt && before.updated_at !== d.expectedUpdatedAt) throw new Error("Someone else changed this item. Refresh and try again.");
  const { data: saved, error } = await w.db.from("tech_backlog_items").update({ ...row, updated_at: new Date().toISOString() }).eq("id", d.id).eq("updated_at", before.updated_at).select("id").maybeSingle();
  if (error || !saved) throw new Error("Someone else changed this item. Refresh and try again.");
  await log(w.db, "backlog", d.id, userId, "updated", { before: { roadmap_column: before.roadmap_column, priority: before.priority, title: before.title }, after: row });
  return { id: d.id };
}

/** Puts a caught error group or an open software issue on the backlog (once). */
export async function addToBacklog(userId: string, d: { from: "error"; message: string; page: string } | { from: "software_issue"; issueId: string }) {
  const w = await managerOnly(userId);
  let insert: Record<string, unknown>;
  if (d.from === "error") {
    const ref = errorFingerprint(d.message, d.page);
    insert = { kind: "bug", title: `${d.message} on ${d.page}`.slice(0, 200), summary: "Caught automatically from people's sessions. See Caught errors for counts.", priority: "high", area: "general", roadmap_column: "next", source: "error", source_ref: ref };
  } else {
    const { data: i } = await w.db.from("software_issues").select("id, title, impact").eq("id", d.issueId).maybeSingle();
    if (!i) throw new Error("Software issue not found.");
    insert = { kind: "bug", title: String(i.title).slice(0, 200), summary: String(i.impact ?? "").slice(0, 4000), roadmap_column: "next", source: "software_issue", source_ref: `software_issue:${i.id}`, software_issue_id: i.id };
  }
  const { data, error } = await w.db.from("tech_backlog_items").insert({ ...insert, created_by: userId }).select("id").single();
  if (error) throw new Error(error.code === "23505" ? "This is already on the backlog." : "Couldn't add it to the backlog.");
  await log(w.db, "backlog", data.id, userId, "created", { from: d.from });
  return { id: data.id as string };
}

export async function saveReleaseNote(userId: string, d: { title: string; body: string; audience: "staff" | "clients"; itemIds: string[] }) {
  const w = await managerOnly(userId);
  const p = feedbackTextProblem(d.title, d.body);
  if (p) throw new Error(p);
  const { data, error } = await w.db.from("tech_release_notes").insert({ title: d.title.trim(), body: d.body.trim(), audience: d.audience, created_by: userId }).select("id").single();
  if (error) throw new Error("Couldn't save the release note.");
  const ids = [...new Set(d.itemIds)];
  if (ids.length) {
    const { error: e2 } = await w.db.from("tech_release_note_items").insert(ids.map((backlog_item_id) => ({ note_id: data.id, backlog_item_id })));
    if (e2) throw new Error("The note was saved but its items couldn't be linked.");
  }
  await log(w.db, "release_note", data.id, userId, "drafted", { items: ids.length, audience: d.audience });
  return { id: data.id as string };
}

/** Publishing moves linked items to Done and shows linked reports as Released. Never emails anyone. */
export async function publishReleaseNote(userId: string, id: string) {
  const w = await managerOnly(userId);
  const { data: n } = await w.db.from("tech_release_notes").select("id, published_at").eq("id", id).maybeSingle();
  if (!n) throw new Error("Release note not found.");
  if (n.published_at) return { ok: true };
  const now = new Date().toISOString();
  const { error } = await w.db.from("tech_release_notes").update({ published_at: now, published_by: userId }).eq("id", id).is("published_at", null);
  if (error) throw new Error("Couldn't publish the note.");
  const { data: links } = await w.db.from("tech_release_note_items").select("backlog_item_id").eq("note_id", id);
  const ids = ((links ?? []) as any[]).map((l) => l.backlog_item_id);
  if (ids.length) {
    await w.db.from("tech_backlog_items").update({ roadmap_column: "done", updated_at: now }).in("id", ids);
    const { data: fbs } = await w.db.from("tech_feedback").select("id, status").in("backlog_item_id", ids).in("status", ["accepted", "merged"]);
    for (const f of (fbs ?? []) as any[]) {
      await w.db.from("tech_feedback").update({ status: "released", updated_at: now }).eq("id", f.id);
      await log(w.db, "feedback", f.id, userId, "released", { note: id });
    }
    for (const i of ids) await log(w.db, "backlog", i, userId, "released", { note: id });
  }
  await log(w.db, "release_note", id, userId, "published", { items: ids.length });
  return { ok: true };
}
