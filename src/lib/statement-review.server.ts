/**
 * Review, release and notice for capital account statements and client
 * financial review memos. Statements are drafted automatically at closing;
 * a Harmonious team member other than the producer approves or returns each
 * one. Investors only ever see approved statements (RLS enforces it too).
 * Emails go out only when staff press "send notice" - never automatically.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertStaff, onboardingActor } from "@/lib/investor-onboarding.server";

const db = () => supabaseAdmin as any;
const PORTAL = "https://onboard.harmonious.co";
const fail = (m: string): never => { throw new Error(m); };

// ------------------------------------------------------------ statements

export async function statementReviewQueue(userId: string) {
  await assertStaff(userId);
  const { data } = await db()
    .from("capital_account_statements")
    .select("id, offering_id, application_id, statement_date, period_end, version, review_status, reviewed_at, review_note, notified_at, generated_by, generated_at, snapshot")
    .eq("superseded", false)
    .order("generated_at", { ascending: false })
    .limit(1000);
  const rows = (data ?? []) as any[];
  const offIds = [...new Set(rows.map((r) => r.offering_id))];
  const { data: offs } = offIds.length ? await db().from("offerings").select("id, name").in("id", offIds) : { data: [] };
  const name = new Map(((offs ?? []) as any[]).map((o) => [o.id, o.name]));
  const funds = offIds.map((id) => {
    const list = rows.filter((r) => r.offering_id === id).map((r) => ({
      id: r.id as string, applicationId: r.application_id as string, version: r.version as number,
      statementDate: r.statement_date as string, status: r.review_status as string, reviewNote: r.review_note ?? null,
      notifiedAt: r.notified_at ?? null, generatedAt: r.generated_at as string, producedByMe: r.generated_by === userId,
      investorName: r.snapshot?.investorName ?? "Investor", hasEmail: !!r.snapshot?.investorEmail,
      contributedCents: Number(r.snapshot?.contributedCents ?? 0), commitmentCents: Number(r.snapshot?.commitmentCents ?? 0),
      snapshot: r.snapshot,
    }));
    return {
      id, name: (name.get(id) as string) ?? "Fund", statements: list,
      drafts: list.filter((s) => s.status === "draft").length,
      readyToNotify: list.filter((s) => s.status === "approved" && !s.notifiedAt && s.hasEmail).length,
    };
  }).sort((a, b) => b.drafts - a.drafts || a.name.localeCompare(b.name));
  return { funds };
}

export async function decideStatement(userId: string, input: { statementId: string; decision: "approved" | "returned"; note?: string | null | undefined }) {
  await assertStaff(userId);
  const note = input.note?.trim() || null;
  if (input.decision === "returned" && !note) fail("Add a note explaining what needs to change.");
  const { data: row } = await db().from("capital_account_statements").select("id, review_status, generated_by, superseded").eq("id", input.statementId).maybeSingle();
  if (!row) fail("That statement was not found.");
  if (row.superseded) fail("A newer version of this statement exists.");
  if (row.review_status !== "draft") fail("This statement has already been reviewed.");
  if (row.generated_by === userId) fail("Someone other than the person who produced this statement must review it.");
  const { error } = await db().from("capital_account_statements")
    .update({ review_status: input.decision, reviewed_by: userId, reviewed_at: new Date().toISOString(), review_note: note })
    .eq("id", input.statementId).eq("review_status", "draft");
  if (error) fail(error.message);
  return { ok: true };
}

/** Sends one "your statement is ready" email per approved, not-yet-notified statement. */
export async function notifyStatements(userId: string, input: { offeringId: string; statementIds?: string[] | undefined }) {
  await assertStaff(userId);
  let q = db().from("capital_account_statements").select("id, snapshot, application_id")
    .eq("offering_id", input.offeringId).eq("superseded", false).eq("review_status", "approved").is("notified_at", null);
  if (input.statementIds?.length) q = q.in("id", input.statementIds);
  const { data } = await q;
  const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
  let sent = 0, skipped = 0;
  for (const s of (data ?? []) as any[]) {
    const email = s.snapshot?.investorEmail;
    if (!email) { skipped += 1; continue; }
    try {
      const r = await sendTemplateEmail("statement-ready", email, { templateData: {
        recipientName: s.snapshot?.investorName ?? "", fundName: s.snapshot?.fundName ?? "your fund",
        kind: "capital account statement", ctaUrl: `${PORTAL}/statements`,
      } });
      if (!r.sent) { skipped += 1; continue; }
      await db().from("capital_account_statements").update({ notified_at: new Date().toISOString(), notified_by: userId }).eq("id", s.id).is("notified_at", null);
      sent += 1;
    } catch (e) {
      console.error("statement-ready email failed", e instanceof Error ? e.message : e);
      skipped += 1;
    }
  }
  return { sent, skipped };
}

// ------------------------------------------------------ review memos

async function memoScope(userId: string, offeringId?: string) {
  const actor = await onboardingActor(userId);
  if (offeringId && !actor.isStaff && !actor.managedOfferingIds.includes(offeringId)) fail("Forbidden: you do not manage that fund.");
  return actor;
}

export async function listReviewMemos(userId: string, offeringId?: string) {
  const actor = await memoScope(userId, offeringId);
  let q = db().from("financial_review_memos").select("*").order("period_end", { ascending: false }).limit(500);
  if (offeringId) q = q.eq("offering_id", offeringId);
  if (!actor.isStaff) {
    if (!actor.managedOfferingIds.length) return { memos: [], funds: [], isStaff: false };
    q = q.in("offering_id", actor.managedOfferingIds).eq("status", "approved");
  }
  const { data } = await q;
  const memos = (data ?? []) as any[];
  let fq = db().from("offerings").select("id, name").order("name").limit(1000);
  if (!actor.isStaff) fq = fq.in("id", actor.managedOfferingIds);
  const { data: offs } = await fq;
  const funds = ((offs ?? []) as any[]).map((o) => ({ id: o.id as string, name: o.name as string }));
  const name = new Map(funds.map((f) => [f.id, f.name]));
  return {
    isStaff: actor.isStaff,
    funds,
    memos: memos.map((m) => ({
      id: m.id, offeringId: m.offering_id, fundName: name.get(m.offering_id) ?? "Fund", periodStart: m.period_start, periodEnd: m.period_end,
      title: m.title, summary: m.summary, findings: (m.findings ?? []) as { area: string; observation: string; action?: string }[],
      status: m.status, preparedAt: m.prepared_at, decidedAt: m.decided_at, decisionNote: actor.isStaff ? m.decision_note : null,
      notifiedAt: m.notified_at, preparedByMe: m.prepared_by === userId,
    })),
  };
}

/** Pulls the published statement figures for the period so the memo cites real numbers. */
export async function memoFigures(userId: string, offeringId: string, periodEnd: string) {
  await assertStaff(userId);
  const { data } = await db().from("financial_reports").select("id, report_type, status, period_start, period_end, version, payload")
    .eq("offering_id", offeringId).eq("period_end", periodEnd).in("status", ["approved", "published"]).order("version", { ascending: false });
  const seen = new Set<string>();
  const reports = ((data ?? []) as any[]).filter((r) => (seen.has(r.report_type) ? false : (seen.add(r.report_type), true)));
  return { reports: reports.map((r) => ({ id: r.id as string, type: r.report_type as string, status: r.status as string, version: r.version as number, totals: r.payload?.totals ?? null })) };
}

export async function saveReviewMemo(userId: string, input: {
  id?: string | undefined; offeringId: string; periodStart: string; periodEnd: string; title: string; summary: string;
  findings: { area: string; observation: string; action?: string | undefined }[]; reportIds: string[];
}) {
  await assertStaff(userId);
  if (input.summary.trim().length < 20) fail("Write a short summary of the review (at least a sentence).");
  const row = {
    offering_id: input.offeringId, period_start: input.periodStart, period_end: input.periodEnd, title: input.title.trim(),
    summary: input.summary.trim(), findings: input.findings, report_ids: input.reportIds, updated_at: new Date().toISOString(),
  };
  if (input.id) {
    const { data: cur } = await db().from("financial_review_memos").select("status, prepared_by").eq("id", input.id).maybeSingle();
    if (!cur) fail("That memo was not found.");
    if (cur.status !== "draft") fail("Only a draft memo can be edited.");
    const { error } = await db().from("financial_review_memos").update({ ...row, prepared_by: userId, prepared_at: new Date().toISOString() }).eq("id", input.id);
    if (error) fail(error.message);
    return { id: input.id };
  }
  const { data, error } = await db().from("financial_review_memos").insert({ ...row, prepared_by: userId }).select("id").single();
  if (error) fail(error.message);
  return { id: data.id as string };
}

export async function decideReviewMemo(userId: string, input: { id: string; decision: "approved" | "returned"; note?: string | null | undefined }) {
  await assertStaff(userId);
  const note = input.note?.trim() || null;
  if (input.decision === "returned" && !note) fail("Add a note explaining what needs to change.");
  const { data: cur } = await db().from("financial_review_memos").select("status, prepared_by").eq("id", input.id).maybeSingle();
  if (!cur) fail("That memo was not found.");
  if (cur.status !== "draft") fail("This memo has already been decided.");
  if (cur.prepared_by === userId) fail("Someone other than the preparer must decide this memo.");
  const { error } = await db().from("financial_review_memos")
    .update({ status: input.decision, decided_by: userId, decided_at: new Date().toISOString(), decision_note: note, updated_at: new Date().toISOString() })
    .eq("id", input.id).eq("status", "draft");
  if (error) fail(error.message);
  return { ok: true };
}

/** Emails the fund's managers that an approved review and statements are in their portal. */
export async function notifyReviewMemo(userId: string, id: string) {
  await assertStaff(userId);
  const { data: memo } = await db().from("financial_review_memos").select("id, offering_id, status, notified_at, title").eq("id", id).maybeSingle();
  if (!memo) fail("That memo was not found.");
  if (memo.status !== "approved") fail("Only an approved memo can be sent.");
  if (memo.notified_at) fail("The notice for this memo was already sent.");
  const [{ data: mgrs }, { data: off }] = await Promise.all([
    db().from("fund_managers").select("user_id").eq("offering_id", memo.offering_id),
    db().from("offerings").select("name").eq("id", memo.offering_id).maybeSingle(),
  ]);
  const ids = ((mgrs ?? []) as any[]).map((m) => m.user_id).filter(Boolean);
  const { data: profs } = ids.length ? await db().from("profiles").select("email, legal_name").in("user_id", ids) : { data: [] };
  const recipients = ((profs ?? []) as any[]).filter((p) => p.email);
  if (!recipients.length) fail("This fund has no fund manager with an email address to notify.");
  const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
  let sent = 0;
  for (const p of recipients) {
    try {
      const r = await sendTemplateEmail("statement-ready", p.email, { templateData: {
        recipientName: p.legal_name ?? "", fundName: off?.name ?? "your fund", kind: "financial review and statements",
        ctaUrl: `${PORTAL}/manager/financials`,
      } });
      if (r.sent) sent += 1;
    } catch (e) {
      console.error("statement-ready email failed", e instanceof Error ? e.message : e);
    }
  }
  if (sent) await db().from("financial_review_memos").update({ notified_at: new Date().toISOString(), notified_by: userId }).eq("id", id).is("notified_at", null);
  return { sent };
}
