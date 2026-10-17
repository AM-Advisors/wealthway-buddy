/**
 * Guided fund setup: one page for staff and fund managers.
 * Reads are allow-listed; every save goes through the canonical fund-setup services
 * (via fund-manager-submissions apply). Drive fill and defaults only create proposals
 * that a Harmonious staff member accepts one by one. Reminders are append-only.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { setupActor, forbid } from "@/lib/fund-setup.server";
import { SETUP_STEPS, STEP_STATUS_LABEL, bankSetupStatus, isSetupFile, redactSensitive, setupDefaults, stepStatus, waitingOnViewer, type SetupStep, type StepStatus } from "@/lib/fund-setup-waiting";

const db = () => supabaseAdmin as any;

/** Fees save as one versioned term set, so a partial change keeps the other current values. */
async function withCurrentFees(userId: string, offeringId: string, payload: Record<string, string>) {
  const { onFile } = await (await import("@/lib/fund-manager-submissions.server")).listSubmissions(userId, offeringId);
  const cur = ((onFile as any)?.fees_team ?? {}) as Record<string, string>;
  const out: Record<string, string> = {};
  for (const k of ["managementFeePercent", "carryPercent", "preferredReturnPercent"]) { const v = payload[k] ?? cur[k]; if (v != null && v !== "") out[k] = v; }
  return out;
}

async function actor(userId: string, offeringId: string) {
  const a = await setupActor(userId);
  if (!a.isStaff && !a.offeringIds.includes(offeringId)) forbid("you do not manage that fund.");
  return a;
}

const REQUIRED: Record<"fund_details" | "fees_team", string[]> = {
  fund_details: ["legalName", "entityType", "jurisdiction", "principalAddress", "minInvestment"],
  fees_team: ["managementFeePercent", "carryPercent", "signers"],
};
const PROPOSAL_FIELDS = ["legalName", "displayName", "entityType", "jurisdiction", "formationDate", "principalAddress", "targetRaise", "minInvestment", "gpName", "regType", "managementFeePercent", "carryPercent", "preferredReturnPercent", "firstSaleDate", "relatedPersons", "solicitationStates", "administrator"] as const;
const FIELD_SECTION: Record<string, "fund_details" | "fees_team" | "info"> = {
  legalName: "fund_details", displayName: "fund_details", entityType: "fund_details", jurisdiction: "fund_details", formationDate: "fund_details", principalAddress: "fund_details", targetRaise: "fund_details", minInvestment: "fund_details", gpName: "fund_details", regType: "fund_details",
  managementFeePercent: "fees_team", carryPercent: "fees_team", preferredReturnPercent: "fees_team",
  firstSaleDate: "info", relatedPersons: "info", solicitationStates: "info", administrator: "info",
};

async function pendingProposals(offeringId: string) {
  const { data: props } = await db().from("fund_setup_proposals").select("*").eq("offering_id", offeringId).order("created_at", { ascending: false }).limit(300);
  const ids = ((props ?? []) as any[]).map((p) => p.id);
  const { data: dec } = ids.length ? await db().from("fund_setup_proposal_decisions").select("proposal_id").in("proposal_id", ids) : { data: [] };
  const decided = new Set(((dec ?? []) as any[]).map((d) => d.proposal_id));
  const seen = new Set<string>();
  const out: any[] = [];
  for (const p of (props ?? []) as any[]) {
    if (decided.has(p.id) || seen.has(`${p.field}:${p.source_kind}`)) continue;
    seen.add(`${p.field}:${p.source_kind}`);
    out.push({ id: p.id, field: p.field, value: p.value, source: p.source_kind === "drive" ? p.source_file_name ?? "Google Drive" : "Harmonious default", kind: p.source_kind, section: FIELD_SECTION[p.field] ?? "info" });
  }
  return out;
}

async function profileNames(ids: string[]) {
  if (!ids.length) return new Map<string, { name: string; email: string | null }>();
  const { data } = await db().from("profiles").select("user_id, legal_name, email").in("user_id", ids);
  return new Map(((data ?? []) as any[]).map((p) => [p.user_id, { name: p.legal_name || p.email || "Fund manager", email: p.email ?? null }]));
}

export async function guidedState(userId: string, offeringId: string) {
  const a = await actor(userId, offeringId);
  const directSetupEdits = a.isStaff || await (await import("@/lib/manager-edit-window.server")).fundEditWindow(offeringId);
  const subs = await import("@/lib/fund-manager-submissions.server");
  const [{ items, onFile }, { data: o }, { data: mgrs }, team, proposals, pct, { data: rem }] = await Promise.all([
    subs.listSubmissions(userId, offeringId),
    db().from("offerings").select("name, client_id, reg_type, drive_folder_url").eq("id", offeringId).maybeSingle(),
    db().from("fund_managers").select("user_id").eq("offering_id", offeringId),
    (await import("@/lib/harmonious-team.server")).loadFundTeam(offeringId).catch(() => null),
    a.isStaff ? pendingProposals(offeringId) : Promise.resolve([] as any[]),
    (await import("@/lib/fund-launch-percent.server")).fundLaunchPercents([offeringId]),
    db().from("fund_setup_reminders").select("step, direction, sent_on").eq("offering_id", offeringId).eq("sent_on", new Date().toISOString().slice(0, 10)),
  ]);
  const { data: client } = o?.client_id ? await db().from("clients").select("saas_only").eq("id", o.client_id).maybeSingle() : { data: null };
  const managerIds = ((mgrs ?? []) as any[]).map((m) => m.user_id as string);
  const opsId = (team?.team ?? []).find((m: any) => m.role === "operations")?.userId ?? null;
  const names = await profileNames([...managerIds, ...(opsId ? [opsId] : []), ...((team?.team ?? []) as any[]).map((m) => m.userId).filter(Boolean)]);
  const managerName = managerIds.map((id) => names.get(id)?.name).filter(Boolean).join(", ") || "Fund manager (no login yet)";
  const opsName = opsId ? names.get(opsId)?.name ?? "Operations" : "Harmonious Operations";

  const latest = (s: string) => (items as any[]).find((i) => i.section === s && i.status !== "withdrawn")?.status ?? null;
  const known = (s: "fund_details" | "fees_team") => {
    const base: Record<string, string> = { ...((onFile as any)?.[s] ?? {}) };
    if (s === "fund_details") base["regType"] = o?.reg_type ?? "";
    return base;
  };
  const missing = (s: "fund_details" | "fees_team") => REQUIRED[s].filter((k) => !known(s)[k]?.trim());
  const hasProp = (sec: string) => proposals.some((p) => p.section === sec);
  const teamComplete = (team?.team ?? []).every((m: any) => m.userId);
  const steps = SETUP_STEPS.map((step: SetupStep) => {
    let status: StepStatus;
    let miss: string[] = [];
    if (step === "fund_details" || step === "fees_team") {
      miss = missing(step);
      status = stepStatus({ submission: latest(step), complete: !miss.length, pendingProposals: hasProp(step) });
    } else if (step === "team") {
      status = stepStatus({ complete: teamComplete, harmoniousOwned: true });
      if (!teamComplete) miss = ((team?.team ?? []) as any[]).filter((m) => !m.userId).map((m) => ({ sales: "Sales", account_manager: "Account Manager", operations: "Operations" } as any)[m.role]);
    } else if (step === "bank") {
      status = bankSetupStatus(!!onFile?.bankOnFile, latest("bank"));
    } else if (step === "document") {
      const has = ((onFile as any)?.documents ?? []).length > 0;
      status = stepStatus({ submission: latest("document"), complete: has });
      if (!has) miss = ["Operating agreement or other fund document"];
    } else {
      const p = pct.get(offeringId) ?? 0;
      status = stepStatus({ complete: p >= 100, harmoniousOwned: true });
    }
    const owner = status === "waiting_manager" || status === "needs_changes" ? managerName : status === "waiting_harmonious" ? opsName : null;
    const remindDir = a.isStaff ? "to_manager" : "to_harmonious";
    const reminded = ((rem ?? []) as any[]).some((r) => r.step === step && r.direction === remindDir);
    return { step, status, statusLabel: STEP_STATUS_LABEL[status], owner, missing: miss, remindedToday: reminded };
  });
  return {
    isStaff: a.isStaff, directSetupEdits, fundName: o?.name ?? "Fund", launchPercent: pct.get(offeringId) ?? 0,
    hasDriveFolder: !!o?.drive_folder_url, saasOnly: !!client?.saas_only,
    administrator: client?.saas_only ? "Client (SaaS-only contract)" : "Harmonious",
    team: ((team?.team ?? []) as any[]).map((m) => ({ role: m.role, name: m.userId ? names.get(m.userId)?.name ?? "Staff member" : null })),
    managerName, opsName, steps, waitingOnYou: waitingOnViewer(steps.map((s) => s.status), a.isStaff),
    proposals,
    defaults: a.isStaff ? setupDefaults({ ...known("fund_details"), regType: o?.reg_type ?? "" }, { saasOnly: !!client?.saas_only }) : {},
    items, onFile,
  };
}

/** Staff save of a section through the canonical services (same path as approving a manager submission). */
export async function staffSave(sb: any, userId: string, input: { offeringId: string; section: "fund_details" | "fees_team"; payload: Record<string, string> }) {
  const a = await actor(userId, input.offeringId);
  if (!a.isStaff) forbid("fund managers submit changes for Harmonious review.");
  const subs = await import("@/lib/fund-manager-submissions.server");
  const payload = input.section === "fees_team" ? await withCurrentFees(userId, input.offeringId, input.payload) : input.payload;
  await subs.applySection(sb, userId, { offering_id: input.offeringId, section: input.section, payload });
  await (await import("@/lib/fund-audit.server")).logFundAudit(userId, { offeringId: input.offeringId, eventType: `staff_save_${input.section}`, summary: `Saved ${input.section === "fees_team" ? "Fees & terms" : "Fund details"}`, values: input.payload });
  await (await import("@/lib/fund-setup-extras.server")).autoCompleteAfterSave({ offeringId: input.offeringId }).catch(() => null);
  return { ok: true };
}

/** Create default proposals for blank fields; staff confirm them like any other proposal. */
export async function proposeDefaults(userId: string, offeringId: string) {
  const s = await guidedState(userId, offeringId);
  if (!s.isStaff) forbid("only Harmonious applies defaults.");
  const run = crypto.randomUUID();
  const rows = Object.entries(s.defaults).filter(([f]) => !s.proposals.some((p: any) => p.field === f)).map(([field, value]) => ({ offering_id: offeringId, run_id: run, field, value, source_kind: "default", created_by: userId }));
  if (rows.length) await db().from("fund_setup_proposals").insert(rows);
  return { created: rows.length };
}

/** Accept or skip proposals. Accepted values save through the canonical services with history. */
export async function decideProposals(sb: any, userId: string, input: { offeringId: string; ids: string[]; decision: "accepted" | "skipped" }) {
  const a = await actor(userId, input.offeringId);
  if (!a.isStaff) forbid("only Harmonious reviews proposed values.");
  const { data: props } = await db().from("fund_setup_proposals").select("*").eq("offering_id", input.offeringId).in("id", input.ids);
  const list = (props ?? []) as any[];
  if (input.decision === "accepted") {
    const bySection: Record<string, Record<string, string>> = { fund_details: {}, fees_team: {} };
    for (const p of list) { const sec = FIELD_SECTION[p.field]; if (sec === "fund_details" || sec === "fees_team") bySection[sec]![p.field] = p.value; }
    const subs = await import("@/lib/fund-manager-submissions.server");
    for (const sec of ["fund_details", "fees_team"] as const) if (Object.keys(bySection[sec]!).length) await subs.applySection(sb, userId, { offering_id: input.offeringId, section: sec, payload: sec === "fees_team" ? await withCurrentFees(userId, input.offeringId, bySection[sec]!) : bySection[sec]! });
    await (await import("@/lib/fund-setup-extras.server")).autoCompleteAfterSave({ offeringId: input.offeringId }).catch(() => null);
  }
  if (list.length) await db().from("fund_setup_proposal_decisions").insert(list.map((p) => ({ proposal_id: p.id, decision: input.decision, decided_by: userId }))).then(() => null, () => null);
  return { decided: list.length };
}

/** One reminder per step, direction and day. Staff -> fund manager by email; manager -> Harmonious on Slack. */
export async function remind(userId: string, input: { offeringId: string; step: SetupStep }) {
  const a = await actor(userId, input.offeringId);
  const direction = a.isStaff ? "to_manager" : "to_harmonious";
  const { error } = await db().from("fund_setup_reminders").insert({ offering_id: input.offeringId, step: input.step, direction, sent_by: userId, channel: a.isStaff ? "email" : "slack" });
  if (error) { if (String(error.code) === "23505") throw new Error("A reminder for this step was already sent today."); throw new Error(error.message); }
  const { data: o } = await db().from("offerings").select("name").eq("id", input.offeringId).maybeSingle();
  const stepLabel = ({ fund_details: "Fund details", team: "Team", fees_team: "Fees & terms", bank: "Bank / wire", document: "Documents", launch: "Review & launch" } as Record<string, string>)[input.step];
  if (a.isStaff) {
    const { data: mgrs } = await db().from("fund_managers").select("user_id").eq("offering_id", input.offeringId);
    const names = await profileNames(((mgrs ?? []) as any[]).map((m) => m.user_id));
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    let sent = 0;
    for (const m of names.values()) {
      if (!m.email) continue;
      await sendTemplateEmail("manager-alert", m.email, { idempotencyKey: `setup-remind:${input.offeringId}:${input.step}:${new Date().toISOString().slice(0, 10)}:${m.email}`, templateData: { managerName: m.name, headline: "A setup step needs you", intro: `Harmonious is waiting on "${stepLabel}" to keep your fund setup moving.`, offeringName: o?.name ?? "your fund", details: [{ label: "Step", value: stepLabel }], portalUrl: `https://app.harmonious.co/manager/fund/${input.offeringId}` } }).then(() => { sent++; }, (e: unknown) => console.error("setup reminder email failed", e));
    }
    if (!sent) throw new Error("This fund manager has no login email yet, so the reminder was logged but not emailed.");
    return { sent };
  }
  await (await import("@/lib/ops-slack-notify.server")).notifySubmission({ kind: "fund_setup_reminder", title: `Fund manager is waiting on Harmonious: ${stepLabel}`, offeringId: input.offeringId, submittedBy: userId, ref: `${input.step}`, path: `/ops/fund/${input.offeringId}?tab=setup` });
  return { sent: 1 };
}

// ---------------- Drive fill (staff only) ----------------

const GATEWAY = "https://connector-gateway.lovable.dev/google_drive/drive/v3";
function driveHeaders() {
  const lk = process.env["LOVABLE_API_KEY"], dk = process.env["GOOGLE_DRIVE_API_KEY"];
  if (!lk || !dk) throw new Error("Google Drive isn't connected for this app.");
  return { Authorization: `Bearer ${lk}`, "X-Connection-Api-Key": dk };
}
function folderIdFrom(url: string) { return url.match(/folders\/([\w-]+)/)?.[1] ?? null; }

async function listSetupFiles(folderId: string) {
  const h = driveHeaders();
  const out: any[] = [];
  let queue = [folderId];
  for (let depth = 0; depth < 3 && queue.length && out.length < 200; depth++) {
    const next: string[] = [];
    for (const id of queue.slice(0, 25)) {
      const q = new URLSearchParams({ q: `'${id}' in parents and trashed=false`, fields: "files(id,name,mimeType,size,modifiedTime)", pageSize: "200", supportsAllDrives: "true", includeItemsFromAllDrives: "true" });
      const r = await fetch(`${GATEWAY}/files?${q}`, { headers: h });
      if (!r.ok) throw new Error(`Google Drive listing failed [${r.status}]: ${(await r.text()).slice(0, 200)}`);
      for (const f of ((await r.json()).files ?? []) as any[]) {
        if (f.mimeType === "application/vnd.google-apps.folder") next.push(f.id);
        else out.push(f);
      }
    }
    queue = next;
  }
  return out.filter((f) => isSetupFile(f.name)).sort((a, b) => String(b.modifiedTime).localeCompare(String(a.modifiedTime))).slice(0, 6);
}

async function fileContent(f: any): Promise<any | null> {
  const h = driveHeaders();
  if (f.mimeType === "application/pdf") {
    if (Number(f.size ?? 0) > 10 * 1024 * 1024) return null;
    const r = await fetch(`${GATEWAY}/files/${f.id}?alt=media&supportsAllDrives=true`, { headers: h });
    if (!r.ok) return null;
    const b64 = Buffer.from(await r.arrayBuffer()).toString("base64");
    return { type: "input_file", filename: `${String(f.name).replace(/[^\w.\- ]+/g, "_").slice(0, 100)}.pdf`, file_data: `data:application/pdf;base64,${b64}` };
  }
  const exp = f.mimeType === "application/vnd.google-apps.spreadsheet" ? "text/csv" : f.mimeType === "application/vnd.google-apps.document" ? "text/plain" : null;
  if (!exp) return null;
  const r = await fetch(`${GATEWAY}/files/${f.id}/export?mimeType=${encodeURIComponent(exp)}`, { headers: h });
  if (!r.ok) return null;
  return { type: "input_text", text: `File "${f.name}":\n${redactSensitive((await r.text()).slice(0, 60_000))}` };
}

async function extract(parts: any[]) {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI isn't configured.");
  const fieldSchema = { type: "object", additionalProperties: false, required: ["value", "file"], properties: { value: { type: ["string", "null"] }, file: { type: ["string", "null"] } } };
  const schema = { type: "object", additionalProperties: false, required: [...PROPOSAL_FIELDS.filter((f) => f !== "administrator")], properties: Object.fromEntries(PROPOSAL_FIELDS.filter((f) => f !== "administrator").map((f) => [f, fieldSchema])) };
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({
      model: "openai/gpt-6-astra", reasoning: { effort: "low" }, store: false,
      instructions: "You read a private fund's formation and offering documents (Form D, certificate of formation, operating agreement, close sheet, PPM). For each field return the value clearly printed and the file name it came from, else null. legalName: exact legal entity name. entityType: LLC, LP, Corporation or Trust. jurisdiction: US state of formation, full name. formationDate and firstSaleDate: YYYY-MM-DD. principalAddress: one line. targetRaise and minInvestment: plain US dollar numbers. regType: 506b or 506c only if explicitly marked. managementFeePercent, carryPercent, preferredReturnPercent: plain numbers. relatedPersons: 'Name (role); ...'. solicitationStates: as stated. gpName: manager/GP entity. Never return SSNs, EINs, ITINs, bank or account numbers.",
      input: [{ role: "user", content: parts }],
      text: { format: { type: "json_schema", name: "fund_setup", strict: true, schema } },
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    console.error(`fund setup AI failed [${res.status}]: ${t}`);
    if (res.status === 429) throw new Error("The AI helper is busy. Try again in a minute.");
    if (res.status === 402) throw new Error("AI credits have run out. Add credits in Settings → Plans & credits.");
    throw new Error(`AI request failed [${res.status}].`);
  }
  const j: any = await res.json();
  const text = String(j?.output_text ?? (j?.output ?? []).flatMap((o: any) => o?.content ?? []).filter((c: any) => c?.type === "output_text").map((c: any) => c.text).join(""));
  try { return JSON.parse(text) as Record<string, { value: string | null; file: string | null }>; } catch { throw new Error("The AI couldn't read those documents."); }
}

export async function fillFromDrive(userId: string, offeringId: string) {
  const a = await actor(userId, offeringId);
  if (!a.isStaff) forbid("only Harmonious can fill setup from Google Drive.");
  const { data: o } = await db().from("offerings").select("drive_folder_url").eq("id", offeringId).maybeSingle();
  const folder = o?.drive_folder_url ? folderIdFrom(o.drive_folder_url) : null;
  if (!folder) throw new Error("Add this fund's Google Drive folder link first.");
  const files = await listSetupFiles(folder);
  if (!files.length) return { files: [], created: 0 };
  const parts = (await Promise.all(files.map(fileContent))).filter(Boolean);
  if (!parts.length) return { files: files.map((f) => f.name), created: 0 };
  const out = await extract(parts);
  const run = crypto.randomUUID();
  const rows: any[] = [];
  for (const f of PROPOSAL_FIELDS) {
    const r = out?.[f];
    let v = typeof r?.value === "string" ? r.value.trim() : "";
    if (!v) continue;
    v = redactSensitive(v).slice(0, 300);
    if (v.includes("[redacted]") && !["relatedPersons", "principalAddress"].includes(f)) continue;
    if (["targetRaise", "minInvestment", "managementFeePercent", "carryPercent", "preferredReturnPercent"].includes(f)) { const n = Number(v.replace(/[,$%\s]/g, "")); if (!Number.isFinite(n)) continue; v = String(n); }
    if (f === "regType" && !["506b", "506c"].includes(v.toLowerCase().replace(/[^\dbc]/g, ""))) continue;
    if (f === "regType") v = v.toLowerCase().replace(/[^\dbc]/g, "");
    const src = files.find((x) => x.name === r?.file) ?? files.find((x) => r?.file && String(x.name).includes(String(r.file)));
    rows.push({ offering_id: offeringId, run_id: run, field: f, value: v, source_kind: "drive", source_file_id: src?.id ?? null, source_file_name: src?.name ?? r?.file ?? "Google Drive", created_by: userId });
  }
  if (rows.length) await db().from("fund_setup_proposals").insert(rows);
  return { files: files.map((f) => f.name), created: rows.length };
}
