/**
 * View As - server-side authorization perspective (read-only).
 * Never uses, mints or substitutes a client token; never touches client sign-in
 * history or security settings. Every call re-validates staff authority, the
 * sign-in session and the canonical relationship. Client-supplied IDs are used
 * only to pick among server-listed perspectives and are always re-checked.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { onboardingActor, assertStaff, investmentReadiness, fundReadiness } from "@/lib/investor-onboarding.server";
import { recordAccessEvent } from "@/lib/access-control.server";
import { editContextIsLive, sessionIsLive, subjectAllowed, VIEW_AS_MINUTES, PERSPECTIVE_LABEL, type Perspective } from "@/lib/view-as";

const db = () => supabaseAdmin as any;
const deny = (m: string): never => { throw new Error(`View As refused: ${m}`); };

async function nameOf(userId: string) {
  const { data } = await db().from("profiles").select("legal_name").eq("user_id", userId).maybeSingle();
  return (data?.legal_name as string | null) ?? "Unnamed person";
}

/** Canonical relationship check - fund_managers row or the investment's own investor. */
async function relationshipHolds(p: { perspective: Perspective; subjectUserId: string; offeringId: string | null; onboardingId: string | null; preview?: boolean | undefined }) {
  // Preview: fund manager screens rendered from the fund's own records; no client account involved.
  if (p.preview) {
    if (p.perspective !== "fund_manager" || !p.offeringId) return false;
    const { data } = await db().from("offerings").select("id").eq("id", p.offeringId).maybeSingle();
    return !!data;
  }
  const subject = await onboardingActor(p.subjectUserId);
  if (!subjectAllowed(subject)) return false;
  if (p.perspective === "fund_manager") return !!p.offeringId && subject.managedOfferingIds.includes(p.offeringId);
  if (!p.onboardingId) return false;
  const { data } = await db().from("investor_onboardings").select("investor_user_id, offering_id").eq("id", p.onboardingId).maybeSingle();
  return !!data && data.investor_user_id === p.subjectUserId && data.offering_id === p.offeringId;
}

/** Perspectives that actually exist for an investment or fund. Staff only. */
export async function listPerspectives(staffUserId: string, input: { onboardingId?: string | null; offeringId?: string | null }) {
  await assertStaff(staffUserId);
  let offeringId = input.offeringId ?? null;
  const out: { perspective: Perspective; subjectUserId: string; name: string; offeringId: string; onboardingId: string | null; preview?: boolean }[] = [];
  if (input.onboardingId) {
    const { data } = await db().from("investor_onboardings").select("investor_user_id, offering_id").eq("id", input.onboardingId).maybeSingle();
    if (!data) deny("that investment was not found.");
    offeringId = data.offering_id;
    const subject = await onboardingActor(data.investor_user_id);
    if (subjectAllowed(subject)) out.push({ perspective: "investor", subjectUserId: data.investor_user_id, name: await nameOf(data.investor_user_id), offeringId: data.offering_id, onboardingId: input.onboardingId });
  }
  if (offeringId) {
    const { data } = await db().from("fund_managers").select("user_id").eq("offering_id", offeringId);
    for (const m of (data ?? []) as any[]) {
      const subject = await onboardingActor(m.user_id);
      if (subjectAllowed(subject)) out.push({ perspective: "fund_manager", subjectUserId: m.user_id, name: await nameOf(m.user_id), offeringId, onboardingId: null });
    }
    const assigned = (data ?? []).length > 0;
    if (!out.some((o) => o.perspective === "fund_manager")) {
      out.push({ perspective: "fund_manager", subjectUserId: staffUserId, offeringId, onboardingId: null, preview: true,
        name: assigned ? "Preview (fund manager has not signed in yet" : "Preview) no fund manager assigned" });
    }
  }
  return out;
}

export async function startViewAs(staffUserId: string, authSessionId: string | null, p: { perspective: Perspective; subjectUserId: string; offeringId: string; onboardingId: string | null; preview?: boolean | undefined }) {
  await assertStaff(staffUserId);
  if (p.preview) p = { ...p, subjectUserId: staffUserId, onboardingId: null };
  if (!(await relationshipHolds(p))) {
    await recordAccessEvent({ actorUserId: staffUserId, actorIdentity: null, targetUserId: p.subjectUserId, action: "view_as.start", outcome: "denied", scopeType: "offering", scopeId: p.offeringId, reason: "no canonical relationship" });
    deny("that perspective does not exist.");
  }
  // One perspective at a time: switching clears the previous context (and any edit context).
  await closeEditContext(staffUserId, "switched");
  await db().from("view_as_sessions").update({ ended_at: new Date().toISOString(), end_reason: "switched" }).eq("staff_user_id", staffUserId).is("ended_at", null);
  const { data, error } = await db().from("view_as_sessions").insert({
    staff_user_id: staffUserId, auth_session_id: authSessionId, perspective: p.perspective, subject_user_id: p.subjectUserId,
    offering_id: p.offeringId, onboarding_id: p.onboardingId, preview: !!p.preview,
    expires_at: new Date(Date.now() + VIEW_AS_MINUTES * 60000).toISOString(),
  }).select("id").single();
  if (error) deny("could not start.");
  await recordAccessEvent({ actorUserId: staffUserId, actorIdentity: null, targetUserId: p.subjectUserId, action: "view_as.start", scopeType: p.onboardingId ? "investment" : "offering", scopeId: p.onboardingId ?? p.offeringId, next: { perspective: p.perspective, mode: "read_only" }, correlationId: data.id });
  return { ok: true };
}

export async function endViewAs(staffUserId: string, reason = "exit") {
  const { data } = await db().from("view_as_sessions").update({ ended_at: new Date().toISOString(), end_reason: reason }).eq("staff_user_id", staffUserId).is("ended_at", null).select("id, subject_user_id");
  for (const s of (data ?? []) as any[]) {
    await recordAccessEvent({ actorUserId: staffUserId, actorIdentity: null, targetUserId: s.subject_user_id, action: "view_as.end", correlationId: s.id, reason });
  }
  return { ok: true };
}

/** Resolve the live perspective, re-checking staff, sign-in and relationship every time. Read-only. */
export async function resolvePerspective(staffUserId: string, authSessionId: string | null) {
  const actor = await onboardingActor(staffUserId);
  if (!actor.isStaff) return null;
  const { data: row } = await db().from("view_as_sessions").select("*").eq("staff_user_id", staffUserId).is("ended_at", null).maybeSingle();
  if (!row || !sessionIsLive(row, staffUserId, authSessionId)) return null;
  const p = { perspective: row.perspective as Perspective, subjectUserId: row.subject_user_id, offeringId: row.offering_id, onboardingId: row.onboarding_id, preview: !!row.preview };
  if (!(await relationshipHolds(p))) return null;
  return { ...p, sessionId: row.id as string };
}

/** Banner context. Returns null when no live perspective (no writes either way). */
export async function activeViewAs(staffUserId: string, authSessionId: string | null) {
  const p = await resolvePerspective(staffUserId, authSessionId);
  if (!p) return null;
  const [{ data: off }, name, onb] = await Promise.all([
    db().from("offerings").select("name").eq("id", p.offeringId).maybeSingle(),
    p.preview ? Promise.resolve("Fund manager preview") : nameOf(p.subjectUserId),
    p.onboardingId ? db().from("investor_onboardings").select("requested_amount_cents").eq("id", p.onboardingId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return {
    perspective: p.perspective,
    roleLabel: PERSPECTIVE_LABEL[p.perspective],
    subjectName: name,
    fundName: (off?.name as string | null) ?? "Fund",
    offeringId: p.offeringId,
    onboardingId: p.onboardingId,
    amountCents: ((onb as any)?.data?.requested_amount_cents ?? null) as number | null,
  };
}

/**
 * The real client screens, rendered through the subject's own server-side
 * authorization (same functions, same role-safe views). The subject's view is
 * always narrower than staff, so staff authority ∩ client view = client view.
 */
export async function viewAsInvestment(staffUserId: string, authSessionId: string | null) {
  const p = await resolvePerspective(staffUserId, authSessionId);
  if (!p || p.perspective !== "investor" || !p.onboardingId) deny("no active investor view.");
  return investmentReadiness(p!.subjectUserId, p!.onboardingId!);
}

export async function viewAsFund(staffUserId: string, authSessionId: string | null) {
  const p = await resolvePerspective(staffUserId, authSessionId);
  if (!p || p.perspective !== "fund_manager") deny("no active fund manager view.");
  return p!.preview ? fundReadiness(staffUserId, p!.offeringId, "manager") : fundReadiness(p!.subjectUserId, p!.offeringId);
}

/**
 * Switch explicitly from View As (read-only) to Edit as Harmonious. Ends the
 * perspective and records which client view was being inspected, so the
 * following edit, made through the existing Operations form and save path,
 * under the staff member's own account, is traceable to View As.
 */
export async function beginEditAsHarmonious(staffUserId: string, authSessionId: string | null) {
  const p = await resolvePerspective(staffUserId, authSessionId);
  if (!p) deny("no active client view.");
  await recordAccessEvent({ actorUserId: staffUserId, actorIdentity: null, targetUserId: p!.subjectUserId, action: "view_as.edit_as_harmonious", scopeType: p!.onboardingId ? "investment" : "offering", scopeId: p!.onboardingId ?? p!.offeringId, previous: { perspective: p!.perspective, mode: "read_only" }, next: { mode: "edit_as_harmonious", attributed_to: "staff" }, correlationId: p!.sessionId });
  await endViewAs(staffUserId, "edit_as_harmonious");
  return { onboardingId: p!.onboardingId, offeringId: p!.offeringId };
}

/**
 * Edit-as-Harmonious context banner. Display only: grants no permission and is
 * never used by any save path. Re-validated on every call; a stale or no-longer
 * authorized context is closed (end_reason edit_context_stale) and hidden.
 */
async function latestEditRow(staffUserId: string) {
  const { data } = await db().from("view_as_sessions").select("*").eq("staff_user_id", staffUserId).eq("end_reason", "edit_as_harmonious").order("ended_at", { ascending: false }).limit(1).maybeSingle();
  return data as any;
}

async function closeEditContext(staffUserId: string, reason: string) {
  const { data } = await db().from("view_as_sessions").update({ end_reason: reason }).eq("staff_user_id", staffUserId).eq("end_reason", "edit_as_harmonious").select("id, subject_user_id");
  for (const s of (data ?? []) as any[]) {
    await recordAccessEvent({ actorUserId: staffUserId, actorIdentity: null, targetUserId: s.subject_user_id, action: "view_as.edit_context_end", correlationId: s.id, reason });
  }
}

export async function activeEditContext(staffUserId: string, authSessionId: string | null) {
  const actor = await onboardingActor(staffUserId);
  if (!actor.isStaff) return null;
  const row = await latestEditRow(staffUserId);
  if (!row) return null;
  const p = { perspective: row.perspective as Perspective, subjectUserId: row.subject_user_id, offeringId: row.offering_id, onboardingId: row.onboarding_id };
  if (!editContextIsLive(row, staffUserId, authSessionId) || !(await relationshipHolds(p))) {
    await closeEditContext(staffUserId, "edit_context_stale");
    return null;
  }
  const [{ data: off }, name, { data: onb }] = await Promise.all([
    db().from("offerings").select("name, client_id").eq("id", p.offeringId).maybeSingle(),
    nameOf(p.subjectUserId),
    p.onboardingId ? db().from("investor_onboardings").select("requested_amount_cents, accepted_amount_cents, investment_profile_id").eq("id", p.onboardingId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const [{ data: client }, { data: profile }] = await Promise.all([
    off?.client_id ? db().from("clients").select("name").eq("id", off.client_id).maybeSingle() : Promise.resolve({ data: null }),
    (onb as any)?.investment_profile_id ? db().from("investment_profiles").select("display_label").eq("id", (onb as any).investment_profile_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return {
    perspective: p.perspective,
    roleLabel: PERSPECTIVE_LABEL[p.perspective],
    subjectName: name,
    clientName: ((client as any)?.name ?? null) as string | null,
    fundName: (off?.name as string | null) ?? "Fund",
    offeringId: p.offeringId as string,
    onboardingId: p.onboardingId as string | null,
    investmentProfileLabel: ((profile as any)?.display_label ?? null) as string | null,
    amountCents: ((onb as any)?.accepted_amount_cents ?? (onb as any)?.requested_amount_cents ?? null) as number | null,
  };
}

export async function exitEditContext(staffUserId: string) {
  await closeEditContext(staffUserId, "edit_context_exited");
  return { ok: true };
}

/** Return to the originating Client View; startViewAs re-checks staff and relationship. */
export async function returnToClientView(staffUserId: string, authSessionId: string | null) {
  const ctx = await activeEditContext(staffUserId, authSessionId);
  if (!ctx) deny("the edit context is no longer active.");
  const subjectUserId = (await latestEditRow(staffUserId)).subject_user_id as string;
  await closeEditContext(staffUserId, "edit_context_returned");
  await startViewAs(staffUserId, authSessionId, { perspective: ctx!.perspective, subjectUserId, offeringId: ctx!.offeringId, onboardingId: ctx!.onboardingId });
  return { ok: true };
}

export type ViewAsItem = { title: string; subtitle?: string | null; date?: string | null; badge?: string | null };
const fmtUsd = (c: number | null | undefined) => (c == null ? null : (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }));
const human = (s: string | null | undefined) => (s ? s.replace(/_/g, " ").replace(/^./, (m) => m.toUpperCase()) : null);

/**
 * Read-only page data for Client View, limited to the subject's own records
 * (investor: their investments/profiles; manager: the viewed fund). Metadata
 * only, no file links, tax numbers or bank details.
 */
export async function viewAsPage(staffUserId: string, authSessionId: string | null, page: string): Promise<{ items: ViewAsItem[] } | null> {
  const p = await resolvePerspective(staffUserId, authSessionId);
  if (!p) deny("no active client view.");
  const d = db();
  const names = async (ids: string[]) => {
    if (!ids.length) return new Map<string, string>();
    const { data } = await d.from("offerings").select("id, name").in("id", [...new Set(ids)]);
    return new Map(((data ?? []) as any[]).map((o) => [o.id, o.name as string]));
  };

  if (p!.perspective === "investor") {
    const uid = p!.subjectUserId;
    const { data: onbs } = await d.from("investor_onboardings").select("id, offering_id, application_id, investment_profile_id, stage, requested_amount_cents, commitment_amount_cents, funded_amount_cents, created_at").eq("investor_user_id", uid).is("removed_at", null);
    const rows = (onbs ?? []) as any[];
    const fund = await names(rows.map((r) => r.offering_id));
    const { data: profs } = await d.from("investment_profiles").select("id").eq("owner_user_id", uid);
    const profileIds = [...new Set([...((profs ?? []) as any[]).map((x) => x.id), ...rows.map((r) => r.investment_profile_id).filter(Boolean)])];
    const catalogDocs = async (k1: boolean) => {
      if (!profileIds.length) return [] as ViewAsItem[];
      const { data: ents } = await d.from("document_entitlements").select("document_id").eq("principal_type", "investment_profile").eq("action", "grant").in("principal_id", profileIds);
      const ids = ((ents ?? []) as any[]).map((e) => e.document_id);
      if (!ids.length) return [];
      let q = d.from("document_catalog").select("file_name, document_type, tax_year, offering_id, published_at").in("id", ids).eq("status", "published");
      q = k1 ? q.eq("document_type", "k1") : q.neq("document_type", "k1");
      const { data } = await q.order("published_at", { ascending: false });
      const docs = (data ?? []) as any[];
      const fn = await names(docs.map((x) => x.offering_id).filter(Boolean));
      return docs.map((x) => ({ title: x.file_name, subtitle: [fn.get(x.offering_id), x.tax_year ? `Tax year ${x.tax_year}` : null].filter(Boolean).join(" · "), date: x.published_at, badge: x.document_type === "k1" ? "K-1" : human(x.document_type) }));
    };
    switch (page) {
      case "/my-funds":
        return { items: rows.map((r) => ({ title: fund.get(r.offering_id) ?? "Fund", subtitle: [fmtUsd(r.commitment_amount_cents ?? r.requested_amount_cents) && `Commitment ${fmtUsd(r.commitment_amount_cents ?? r.requested_amount_cents)}`, r.funded_amount_cents ? `Funded ${fmtUsd(r.funded_amount_cents)}` : null].filter(Boolean).join(" · "), date: r.created_at, badge: human(r.stage) })) };
      case "/activity": {
        if (!rows.length) return { items: [] };
        const { data } = await d.from("investor_onboarding_events").select("event, offering_id, to_status, created_at").in("onboarding_id", rows.map((r) => r.id)).order("created_at", { ascending: false }).limit(50);
        return { items: ((data ?? []) as any[]).map((e) => ({ title: human(e.event) ?? "Update", subtitle: [fund.get(e.offering_id), e.to_status ? `Now ${human(e.to_status)}` : null].filter(Boolean).join(" · "), date: e.created_at })) };
      }
      case "/investor-reporting": {
        const [{ data: st }, { data: fr }] = await Promise.all([
          d.from("investor_statements").select("offering_id, period_start, period_end, published_at").eq("investor_user_id", uid).not("published_at", "is", null).order("period_end", { ascending: false }),
          d.from("financial_reports").select("offering_id, report_type, period_end, published_at").eq("subject_user_id", uid).eq("investor_visible", true).not("published_at", "is", null).order("period_end", { ascending: false }),
        ]);
        const all = [...((st ?? []) as any[]).map((x) => ({ ...x, kind: "Capital statement" })), ...((fr ?? []) as any[]).map((x) => ({ ...x, kind: human(x.report_type) ?? "Report" }))];
        const fn = await names(all.map((x) => x.offering_id).filter(Boolean));
        return { items: all.map((x) => ({ title: x.kind, subtitle: [fn.get(x.offering_id), x.period_end ? `Period ending ${x.period_end}` : null].filter(Boolean).join(" · "), date: x.published_at })) };
      }
      case "/documents": {
        const { data: up } = await d.from("investor_documents").select("file_name, doc_kind, offering_id, uploaded_at, review_status").eq("user_id", uid).order("uploaded_at", { ascending: false });
        const fn = await names(((up ?? []) as any[]).map((x) => x.offering_id).filter(Boolean));
        const mine = ((up ?? []) as any[]).map((x) => ({ title: x.file_name, subtitle: [human(x.doc_kind), fn.get(x.offering_id), "Uploaded by them"].filter(Boolean).join(" · "), date: x.uploaded_at, badge: human(x.review_status) }));
        return { items: [...(await catalogDocs(false)), ...mine] };
      }
      case "/tax": {
        const { data: ft } = await d.from("fund_tax_documents").select("file_name, doc_type, tax_year, offering_id, created_at").eq("investor_user_id", uid).eq("review_status", "approved");
        const fn = await names(((ft ?? []) as any[]).map((x) => x.offering_id));
        return { items: [...(await catalogDocs(true)), ...((ft ?? []) as any[]).map((x) => ({ title: x.file_name, subtitle: [fn.get(x.offering_id), x.tax_year ? `Tax year ${x.tax_year}` : null].filter(Boolean).join(" · "), date: x.created_at, badge: human(x.doc_type) }))] };
      }
      case "/messages": {
        const apps = rows.map((r) => r.application_id).filter(Boolean);
        if (!apps.length) return { items: [] };
        const { data } = await d.from("portal_messages").select("sender_name, sender_role, body, offering_id, created_at").in("application_id", apps).order("created_at", { ascending: false }).limit(50);
        return { items: ((data ?? []) as any[]).map((m) => ({ title: m.sender_name ?? human(m.sender_role) ?? "Message", subtitle: String(m.body ?? "").slice(0, 200), date: m.created_at, badge: fund.get(m.offering_id) ?? null })) };
      }
    }
    return null;
  }

  // Fund manager: only the viewed fund (or the funds they manage for My Funds).
  const off = p!.offeringId;
  switch (page) {
    case "/my-funds": {
      let ids = [off];
      if (!p!.preview) {
        const { data } = await d.from("fund_managers").select("offering_id").eq("user_id", p!.subjectUserId);
        ids = [...new Set([off, ...((data ?? []) as any[]).map((x) => x.offering_id)])];
      }
      const { data } = await d.from("offerings").select("name, status, created_at").in("id", ids);
      return { items: ((data ?? []) as any[]).map((o) => ({ title: o.name, date: o.created_at, badge: human(o.status) })) };
    }
    case "/manager/investors": {
      const { data } = await d.from("investor_onboardings").select("investor_user_id, stage, commitment_amount_cents, requested_amount_cents, created_at").eq("offering_id", off).is("removed_at", null);
      const r = (data ?? []) as any[];
      const { data: pr } = r.length ? await d.from("profiles").select("user_id, legal_name").in("user_id", r.map((x) => x.investor_user_id)) : { data: [] };
      const nm = new Map(((pr ?? []) as any[]).map((x) => [x.user_id, x.legal_name]));
      return { items: r.map((x) => ({ title: nm.get(x.investor_user_id) ?? "Investor", subtitle: fmtUsd(x.commitment_amount_cents ?? x.requested_amount_cents), date: x.created_at, badge: human(x.stage) })) };
    }
    case "/manager/reporting": {
      const { data } = await d.from("financial_reports").select("report_type, period_end, published_at").eq("offering_id", off).eq("manager_visible", true).not("published_at", "is", null).order("period_end", { ascending: false });
      return { items: ((data ?? []) as any[]).map((x) => ({ title: human(x.report_type) ?? "Report", subtitle: x.period_end ? `Period ending ${x.period_end}` : null, date: x.published_at })) };
    }
    case "/manager/messages": {
      const { data } = await d.from("portal_messages").select("sender_name, sender_role, body, created_at").eq("offering_id", off).order("created_at", { ascending: false }).limit(50);
      return { items: ((data ?? []) as any[]).map((m) => ({ title: m.sender_name ?? human(m.sender_role) ?? "Message", subtitle: String(m.body ?? "").slice(0, 200), date: m.created_at })) };
    }
  }
  return null;
}
