/**
 * Quarterly / annual financial statement packages.
 * Prepare (Harmonious) → Review (a different Harmonious person) → Approve
 * (a fund manager of that exact fund). Each step is logged append-only.
 * Emails go out only when staff press the notice button.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { onboardingActor } from "@/lib/investor-onboarding.server";

const db = () => supabaseAdmin as any;
const PORTAL = "https://onboard.harmonious.co";
const fail = (m: string): never => { throw new Error(m); };
export const PACKAGE_REPORTS = ["balance_sheet", "income_statement", "changes_in_capital"] as const;

async function log(packageId: string, action: string, actorId: string, actorRole: string, note?: string | null) {
  await db().from("financial_statement_package_events").insert({ package_id: packageId, action, actor_id: actorId, actor_role: actorRole, note: note ?? null });
}

async function load(id: string) {
  const { data } = await db().from("financial_statement_packages").select("*").eq("id", id).maybeSingle();
  if (!data) fail("That statement package was not found.");
  return data as any;
}

async function staff(userId: string) {
  const a = await onboardingActor(userId);
  if (!a.isStaff) fail("Forbidden: Harmonious team access only.");
  return a;
}

async function reportsFor(offeringId: string, periodEnd: string) {
  const { data } = await db().from("financial_reports").select("id, report_type, version, status, payload")
    .eq("offering_id", offeringId).eq("period_end", periodEnd).in("report_type", PACKAGE_REPORTS as unknown as string[])
    .in("status", ["approved", "published"]).order("version", { ascending: false });
  const seen = new Set<string>();
  const rows = ((data ?? []) as any[]).filter((r) => (seen.has(r.report_type) ? false : (seen.add(r.report_type), true)));
  const figures: Record<string, any> = {};
  for (const r of rows) figures[r.report_type] = { reportId: r.id, version: r.version, status: r.status, totals: r.payload?.totals ?? null };
  return { ids: rows.map((r) => r.id as string), figures };
}

export async function listPackages(userId: string) {
  const actor = await onboardingActor(userId);
  let q = db().from("financial_statement_packages").select("*").order("period_end", { ascending: false }).limit(500);
  if (!actor.isStaff) {
    if (!actor.managedOfferingIds.length) return { isStaff: false, funds: [], packages: [] };
    q = q.in("offering_id", actor.managedOfferingIds).in("status", ["manager_review", "approved"]);
  }
  const { data } = await q;
  let fq = db().from("offerings").select("id, name").order("name").limit(1000);
  if (!actor.isStaff) fq = fq.in("id", actor.managedOfferingIds);
  const { data: offs } = await fq;
  const funds = ((offs ?? []) as any[]).map((o) => ({ id: o.id as string, name: o.name as string }));
  const name = new Map(funds.map((f) => [f.id, f.name]));
  return {
    isStaff: actor.isStaff,
    funds,
    packages: ((data ?? []) as any[]).map((p) => ({
      id: p.id as string, offeringId: p.offering_id as string, fundName: name.get(p.offering_id) ?? "Fund",
      periodType: p.period_type as "quarterly" | "annual", periodStart: p.period_start as string, periodEnd: p.period_end as string,
      status: p.status as string, notes: p.notes as string, figures: p.figures ?? {}, returnedNote: p.returned_note ?? null,
      preparedAt: p.prepared_at, reviewedAt: p.reviewed_at, approvedAt: p.approved_at, managerNotifiedAt: p.manager_notified_at,
      preparedByMe: p.prepared_by === userId, reviewedByMe: p.reviewed_by === userId,
      canManagerApprove: p.status === "manager_review" && actor.managedOfferingIds.includes(p.offering_id)
        && p.prepared_by !== userId && p.reviewed_by !== userId,
    })),
  };
}

export async function savePackage(userId: string, input: {
  id?: string | undefined; offeringId: string; periodType: "quarterly" | "annual"; periodStart: string; periodEnd: string; notes: string;
}) {
  await staff(userId);
  if (input.periodEnd < input.periodStart) fail("The period end must be after the start.");
  const { ids, figures } = await reportsFor(input.offeringId, input.periodEnd);
  const row = {
    offering_id: input.offeringId, period_type: input.periodType, period_start: input.periodStart, period_end: input.periodEnd,
    notes: input.notes.trim(), report_ids: ids, figures, prepared_by: userId, prepared_at: new Date().toISOString(),
  };
  if (input.id) {
    const cur = await load(input.id);
    if (!["draft", "returned"].includes(cur.status)) fail("Only a draft or returned package can be edited.");
    const { error } = await db().from("financial_statement_packages").update({ ...row, status: "draft", reviewed_by: null, reviewed_at: null }).eq("id", input.id);
    if (error) fail(error.message);
    await log(input.id, "prepared", userId, "harmonious");
    return { id: input.id };
  }
  const { data, error } = await db().from("financial_statement_packages").insert(row).select("id").single();
  if (error) fail(error.message);
  await log(data.id, "prepared", userId, "harmonious");
  return { id: data.id as string };
}

export async function packageAction(userId: string, input: { id: string; action: "submit" | "review_pass" | "return" | "manager_approve" | "manager_return"; note?: string | null | undefined }) {
  const actor = await onboardingActor(userId);
  const p = await load(input.id);
  const note = input.note?.trim() || null;
  const now = new Date().toISOString();
  const upd = async (patch: Record<string, unknown>, from: string) => {
    const { error } = await db().from("financial_statement_packages").update(patch).eq("id", p.id).eq("status", from);
    if (error) fail(error.message);
  };
  if (input.action === "submit") {
    if (!actor.isStaff) fail("Forbidden.");
    if (p.status !== "draft") fail("Only a draft can be submitted for review.");
    if (!(p.report_ids ?? []).length) fail("No approved statements exist for this period yet. Approve them in Financial reporting first.");
    await upd({ status: "in_review" }, "draft");
  } else if (input.action === "review_pass" || input.action === "return") {
    if (!actor.isStaff) fail("Forbidden.");
    if (p.status !== "in_review") fail("This package isn't waiting for Harmonious review.");
    if (p.prepared_by === userId) fail("Someone other than the preparer must review this package.");
    if (input.action === "return") {
      if (!note) fail("Add a note explaining what needs to change.");
      await upd({ status: "returned", returned_note: note }, "in_review");
    } else {
      await upd({ status: "manager_review", reviewed_by: userId, reviewed_at: now, returned_note: null }, "in_review");
    }
  } else {
    if (!actor.managedOfferingIds.includes(p.offering_id)) fail("Only a fund manager of this fund can approve it.");
    if (p.status !== "manager_review") fail("This package isn't waiting for your approval.");
    if (p.prepared_by === userId || p.reviewed_by === userId) fail("You prepared or reviewed this package, so you can't approve it.");
    if (input.action === "manager_return") {
      if (!note) fail("Add a note explaining what needs to change.");
      await upd({ status: "returned", returned_note: note }, "manager_review");
    } else {
      await upd({ status: "approved", approved_by: userId, approved_at: now }, "manager_review");
    }
  }
  await log(p.id, input.action, userId, input.action.startsWith("manager") ? "fund_manager" : "harmonious", note);
  return { ok: true };
}

export async function packageHistory(userId: string, id: string) {
  const actor = await onboardingActor(userId);
  const p = await load(id);
  if (!actor.isStaff && !actor.managedOfferingIds.includes(p.offering_id)) fail("Forbidden.");
  const { data } = await db().from("financial_statement_package_events").select("action, actor_id, actor_role, note, created_at").eq("package_id", id).order("created_at");
  const rows = (data ?? []) as any[];
  const ids = [...new Set(rows.map((r) => r.actor_id))];
  const { data: profs } = ids.length ? await db().from("profiles").select("user_id, legal_name, email").in("user_id", ids) : { data: [] };
  const who = new Map(((profs ?? []) as any[]).map((x) => [x.user_id, x.legal_name || x.email || "Someone"]));
  return { events: rows.map((r) => ({ action: r.action, who: who.get(r.actor_id) ?? "Someone", role: r.actor_role, note: r.note, at: r.created_at })) };
}

/** Explicit staff action: emails the fund's managers that a package awaits approval. */
export async function notifyManagers(userId: string, id: string) {
  await staff(userId);
  const p = await load(id);
  if (p.status !== "manager_review") fail("Only a package waiting for the fund manager can be sent.");
  if (p.manager_notified_at) fail("The fund manager was already notified.");
  const [{ data: mgrs }, { data: off }] = await Promise.all([
    db().from("fund_managers").select("user_id").eq("offering_id", p.offering_id),
    db().from("offerings").select("name").eq("id", p.offering_id).maybeSingle(),
  ]);
  const ids = ((mgrs ?? []) as any[]).map((m) => m.user_id).filter(Boolean);
  const { data: profs } = ids.length ? await db().from("profiles").select("email, legal_name").in("user_id", ids) : { data: [] };
  const recipients = ((profs ?? []) as any[]).filter((x) => x.email);
  if (!recipients.length) fail("This fund has no fund manager with an email address to notify.");
  const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
  let sent = 0;
  for (const r of recipients) {
    try {
      const res = await sendTemplateEmail("statement-ready", r.email, { templateData: {
        recipientName: r.legal_name ?? "", fundName: off?.name ?? "your fund",
        kind: `${p.period_type} financial statements`, ctaUrl: `${PORTAL}/manager/financial-reviews`,
      } });
      if (res.sent) sent += 1;
    } catch (e) { console.error("statement package email failed", e instanceof Error ? e.message : e); }
  }
  if (sent) {
    await db().from("financial_statement_packages").update({ manager_notified_at: new Date().toISOString() }).eq("id", id).is("manager_notified_at", null);
    await log(id, "manager_notified", userId, "harmonious");
  }
  return { sent };
}
