/**
 * Phase 4 tax records: 1065 line detail, K-1 history, Form PF, IRS correspondence.
 * All append-only. Nothing is filed, transmitted or sent to the IRS or SEC.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertTaxStaff, assertFundTaxAccess, taxActor } from "@/lib/tax-authz.server";
import { assertNoRawTin } from "@/lib/tax-model";
import { prefill1065, tieChecks, checkDetailStage, MONEY_LINE_IDS, LINES_1065, type DetailStage, type K1Lite } from "@/lib/form-1065-detail";
import { checkPf, type PfStatus, type IrsStatus, daysUntil } from "@/lib/form-pf";

const db = () => supabaseAdmin as any;
const CURRENT_K1 = ["draft", "review", "approved", "final", "delivered"];

async function names(ids: string[]) {
  const u = [...new Set(ids.filter(Boolean))];
  if (!u.length) return new Map<string, string>();
  const { data } = await db().from("persons").select("user_id, legal_first_name, legal_last_name").in("user_id", u);
  return new Map<string, string>(((data ?? []) as any[]).map((p) => [p.user_id, `${p.legal_first_name ?? ""} ${p.legal_last_name ?? ""}`.trim() || "Harmonious team member"]));
}
async function fundNames(ids: string[]) {
  const u = [...new Set(ids.filter(Boolean))];
  if (!u.length) return new Map<string, string>();
  const { data } = await db().from("offerings").select("id, name").in("id", u);
  return new Map<string, string>(((data ?? []) as any[]).map((o) => [o.id, o.name]));
}

/* ------------------------------------------------------------ 1065 detail */

async function returnContext(returnId: string) {
  const { data: ret } = await db().from("partnership_returns").select("*").eq("id", returnId).maybeSingle();
  if (!ret) throw new Error("That 1065 was not found.");
  const { data: k1Rows } = await db().from("k1_forms").select("id, boxes, tax_capital, status").eq("return_id", returnId).in("status", CURRENT_K1);
  const k1s: K1Lite[] = ((k1Rows ?? []) as any[]).map((k) => ({ boxes: k.boxes ?? {}, endingCapitalCents: typeof k.tax_capital?.ending_cents === "number" ? k.tax_capital.ending_cents : null }));
  const { data: versions } = await db().from("partnership_return_details").select("*").eq("return_id", returnId).order("version", { ascending: false });
  return { ret, k1s, versions: (versions ?? []) as any[] };
}

export async function get1065Detail(userId: string, returnId: string) {
  const { ret, k1s, versions } = await returnContext(returnId);
  const actor = await assertFundTaxAccess(userId, ret.offering_id);
  const latest = versions[0] ?? null;
  const values = latest ? latest.values_cents : prefill1065(ret, k1s);
  const ties = tieChecks(values, k1s);
  const fn = await fundNames([ret.offering_id]);
  const who = await names(versions.map((v) => v.recorded_by));
  const base = {
    returnId, offeringId: ret.offering_id, fundName: fn.get(ret.offering_id) ?? "Fund", taxYear: ret.tax_year, returnStatus: ret.status, returnVersion: ret.version,
    stage: (latest?.stage ?? null) as DetailStage | null, detailVersion: latest?.version ?? 0, k1Count: k1s.length, ties, prefilled: !latest,
  };
  if (!actor.isStaff) {
    // Managers: summary and tie results only.
    return { ...base, canEdit: false, values: null, answers: null, history: [] };
  }
  return {
    ...base, canEdit: true, userId, values, answers: latest?.answers ?? {},
    preparedBy: versions.find((v) => v.stage === "ready_for_review")?.recorded_by ?? null,
    history: versions.map((v) => ({ version: v.version, stage: v.stage, note: v.note, by: who.get(v.recorded_by) ?? "Harmonious team member", at: v.created_at })),
  };
}

export async function save1065Detail(userId: string, i: { returnId: string; values: Record<string, number>; answers: Record<string, string>; stage: DetailStage; note?: string | null | undefined }) {
  await assertTaxStaff(userId);
  const { ret, k1s, versions } = await returnContext(i.returnId);
  if (["superseded", "amended", "accepted", "transmitted"].includes(ret.status)) throw new Error("This 1065 version is closed. Work on its replacement instead.");
  const latest = versions[0] ?? null;
  const clean: Record<string, number> = {};
  for (const [k, v] of Object.entries(i.values)) if (MONEY_LINE_IDS.has(k) && Number.isFinite(v)) clean[k] = Math.round(v);
  const textIds = new Set(LINES_1065.filter((l) => l.kind === "text" || l.kind === "yesno").map((l) => l.id));
  const answers = Object.fromEntries(Object.entries(i.answers).filter(([k]) => textIds.has(k)).map(([k, v]) => [k, String(v).slice(0, 300)]));
  assertNoRawTin(answers, "1065 detail");
  // Review steps keep the reviewed values exactly; only drafting can change amounts.
  const values = i.stage === "draft" || i.stage === "ready_for_review" ? clean : latest?.values_cents ?? clean;
  const ties = tieChecks(values, k1s);
  const preparedBy = versions.find((v) => v.stage === "ready_for_review")?.recorded_by ?? null;
  const err = checkDetailStage({ from: latest?.stage ?? null, to: i.stage, actorId: userId, preparedBy: i.stage === "reviewed" ? (latest?.recorded_by ?? preparedBy) : preparedBy, ties });
  if (err) throw new Error(err);
  const { error } = await db().from("partnership_return_details").insert({
    return_id: i.returnId, offering_id: ret.offering_id, version: (latest?.version ?? 0) + 1, values_cents: values,
    answers: i.stage === "draft" || i.stage === "ready_for_review" ? answers : latest?.answers ?? answers,
    tie_results: ties, stage: i.stage, note: i.note?.slice(0, 1000) ?? null, recorded_by: userId,
  });
  if (error) throw new Error(error.code === "23505" ? "Someone else just saved this. Refresh and try again." : error.message);
  return { ok: true };
}

/* ------------------------------------------------------------ K-1 history */

export async function k1History(userId: string, i: { offeringId: string; taxYear?: number | undefined }) {
  const actor = await assertFundTaxAccess(userId, i.offeringId);
  let q = db().from("k1_forms").select("id, investor_user_id, investment_profile_id, tax_year, version, status, supersedes_id, amendment_reason, boxes, prepared_by, prepared_at, reviewed_by, reviewed_at, approved_by, approved_at, created_at").eq("offering_id", i.offeringId);
  if (i.taxYear) q = q.eq("tax_year", i.taxYear);
  const { data } = await q.order("created_at");
  const rows = (data ?? []) as any[];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const profIds = [...new Set(rows.map((r) => r.investment_profile_id).filter(Boolean))];
  const { data: profs } = profIds.length ? await db().from("investment_profiles").select("id, display_name, legal_name").in("id", profIds) : { data: [] };
  const pn = new Map<string, string>(((profs ?? []) as any[]).map((p) => [p.id, p.display_name || p.legal_name || "Investor"]));
  const who = actor.isStaff ? await names(rows.flatMap((r) => [r.prepared_by, r.reviewed_by, r.approved_by])) : new Map();
  // Chains: roots are K-1s that don't supersede anything.
  const children = new Map<string, any>();
  for (const r of rows) if (r.supersedes_id) children.set(r.supersedes_id, r);
  const chains = rows.filter((r) => !r.supersedes_id || !byId.has(r.supersedes_id)).map((root) => {
    const versions: any[] = [];
    let cur: any = root;
    while (cur) { versions.push(cur); cur = children.get(cur.id); }
    return {
      investor: pn.get(root.investment_profile_id) ?? "Investor", taxYear: root.tax_year,
      versions: versions.map((v, idx) => {
        const prev = versions[idx - 1];
        const changes = prev ? Object.keys({ ...prev.boxes, ...v.boxes }).filter((b) => Number(prev.boxes?.[b] ?? 0) !== Number(v.boxes?.[b] ?? 0)).map((b) => ({ box: b, from: Number(prev.boxes?.[b] ?? 0), to: Number(v.boxes?.[b] ?? 0) })) : [];
        return {
          id: v.id, version: v.version, status: v.status, at: v.created_at,
          ...(actor.isStaff ? {
            reason: v.amendment_reason, changes,
            preparedBy: v.prepared_by ? who.get(v.prepared_by) ?? "Harmonious team member" : null,
            reviewedBy: v.reviewed_by ? who.get(v.reviewed_by) ?? "Harmonious team member" : null,
            approvedBy: v.approved_by ? who.get(v.approved_by) ?? "Harmonious team member" : null,
          } : { changedBoxes: changes.length }),
        };
      }),
    };
  });
  return { canSeeDetail: actor.isStaff, chains };
}

/* ------------------------------------------------------------ Form PF (staff only) */

export async function listFormPf(userId: string) {
  await assertTaxStaff(userId);
  const { data: filings } = await db().from("form_pf_filings").select("*").order("period_end", { ascending: false });
  const ids = ((filings ?? []) as any[]).map((f) => f.id);
  const { data: vers } = ids.length ? await db().from("form_pf_versions").select("*").in("filing_id", ids).order("version", { ascending: false }) : { data: [] };
  const fn = await fundNames(((vers ?? []) as any[]).flatMap((v) => v.offering_ids ?? []));
  const who = await names(((vers ?? []) as any[]).map((v) => v.recorded_by));
  const { data: funds } = await db().from("offerings").select("id, name").is("retired_at", null).order("name");
  return {
    userId,
    funds: (funds ?? []) as { id: string; name: string }[],
    filings: ((filings ?? []) as any[]).map((f) => {
      const vs = ((vers ?? []) as any[]).filter((v) => v.filing_id === f.id);
      const cur = vs[0];
      return {
        id: f.id, adviserName: f.adviser_name, periodType: f.period_type, periodEnd: f.period_end,
        current: cur ? {
          version: cur.version, status: cur.status as PfStatus, crd: cur.crd_number, sec: cur.sec_file_number, size: cur.adviser_size, dueDate: cur.due_date,
          offeringIds: cur.offering_ids ?? [], funds: (cur.offering_ids ?? []).map((id: string) => fn.get(id) ?? "Fund"), sections: cur.sections ?? [],
          aumCents: cur.regulatory_aum_cents, filedOn: cur.filed_on, confirmation: cur.filing_confirmation,
          dueIn: daysUntil(cur.due_date),
        } : null,
        preparedBy: vs.find((v) => v.status === "ready_for_review")?.recorded_by ?? null,
        history: vs.map((v) => ({ version: v.version, status: v.status, note: v.note, by: who.get(v.recorded_by) ?? "Harmonious team member", at: v.created_at })),
      };
    }),
  };
}

export async function createFormPf(userId: string, i: { adviserName: string; periodType: "annual" | "quarterly"; periodEnd: string }) {
  await assertTaxStaff(userId);
  const { data, error } = await db().from("form_pf_filings").insert({ adviser_name: i.adviserName.trim().slice(0, 200), period_type: i.periodType, period_end: i.periodEnd, created_by: userId }).select("id").single();
  if (error) throw new Error(error.message);
  await db().from("form_pf_versions").insert({ filing_id: data.id, version: 1, status: "draft", recorded_by: userId });
  return { id: data.id };
}

export async function saveFormPfVersion(userId: string, i: {
  filingId: string; status: PfStatus; crd?: string | null | undefined; sec?: string | null | undefined; size: string; dueDate?: string | null | undefined;
  offeringIds: string[]; sections: string[]; aumCents?: number | null | undefined; filedOn?: string | null | undefined; confirmation?: string | null | undefined; note?: string | null | undefined;
}) {
  await assertTaxStaff(userId);
  const { data: vs } = await db().from("form_pf_versions").select("*").eq("filing_id", i.filingId).order("version", { ascending: false });
  const list = (vs ?? []) as any[];
  const cur = list[0] ?? null;
  const preparedBy = list.find((v) => v.status === "ready_for_review")?.recorded_by ?? null;
  const reviewing = i.status === "reviewed" || i.status === "filed_by_adviser";
  // Review/filing steps carry forward the reviewed content; only filing fields are new.
  const content = reviewing && cur ? {
    crd_number: cur.crd_number, sec_file_number: cur.sec_file_number, adviser_size: cur.adviser_size, due_date: cur.due_date,
    offering_ids: cur.offering_ids, sections: cur.sections, regulatory_aum_cents: cur.regulatory_aum_cents,
  } : {
    crd_number: i.crd?.slice(0, 40) ?? null, sec_file_number: i.sec?.slice(0, 40) ?? null, adviser_size: i.size, due_date: i.dueDate || null,
    offering_ids: i.offeringIds, sections: i.sections, regulatory_aum_cents: i.aumCents ?? null,
  };
  const err = checkPf(cur?.status ?? null, i.status, userId, i.status === "reviewed" ? preparedBy : preparedBy, { filedOn: i.filedOn ?? null, filingConfirmation: i.confirmation ?? null, offeringIds: content.offering_ids });
  if (err) throw new Error(err);
  const { error } = await db().from("form_pf_versions").insert({
    filing_id: i.filingId, version: (cur?.version ?? 0) + 1, status: i.status, ...content,
    filed_on: i.status === "filed_by_adviser" ? i.filedOn : null, filing_confirmation: i.status === "filed_by_adviser" ? i.confirmation?.slice(0, 120) : null,
    note: i.note?.slice(0, 1000) ?? null, recorded_by: userId,
  });
  if (error) throw new Error(error.code === "23505" ? "Someone else just saved this. Refresh and try again." : error.message);
  return { ok: true };
}

/* ------------------------------------------------------------ IRS correspondence */

export async function listIrs(userId: string, i: { offeringId?: string | undefined }) {
  const actor = await taxActor(userId);
  if (!actor.isStaff) {
    if (!i.offeringId) throw new Error("Choose a Fund.");
    await assertFundTaxAccess(userId, i.offeringId);
  }
  let q = db().from("irs_correspondence").select("*").order("received_on", { ascending: false }).limit(200);
  if (i.offeringId) q = q.eq("offering_id", i.offeringId);
  if (!actor.isStaff) q = q.eq("share_with_manager", true);
  const { data } = await q;
  const rows = (data ?? []) as any[];
  const ids = rows.map((r) => r.id);
  const { data: evs } = ids.length ? await db().from("irs_correspondence_events").select("*").in("correspondence_id", ids).order("created_at", { ascending: false }) : { data: [] };
  const fn = await fundNames(rows.map((r) => r.offering_id));
  const who = actor.isStaff ? await names(((evs ?? []) as any[]).map((e) => e.recorded_by)) : new Map();
  const { data: funds } = actor.isStaff ? await db().from("offerings").select("id, name").is("retired_at", null).order("name") : { data: [] };
  return {
    canEdit: actor.isStaff, funds: funds ?? [],
    items: rows.map((r) => {
      const e = ((evs ?? []) as any[]).filter((x) => x.correspondence_id === r.id);
      const status = (e[0]?.status ?? "open") as IrsStatus;
      return {
        id: r.id, offeringId: r.offering_id, fundName: fn.get(r.offering_id) ?? "Fund", direction: r.direction, noticeCode: r.notice_code, subject: r.subject,
        taxYear: r.tax_year, formType: r.form_type, receivedOn: r.received_on, responseDue: r.response_due, status,
        dueIn: status === "open" ? daysUntil(r.response_due) : null, shareWithManager: r.share_with_manager,
        ...(actor.isStaff ? { hasDocument: !!r.storage_path, history: e.map((x) => ({ status: x.status, note: x.note, by: who.get(x.recorded_by) ?? "Harmonious team member", at: x.created_at })) } : {}),
      };
    }),
  };
}

export async function recordIrs(userId: string, i: { offeringId: string; direction: "received" | "sent" | "phone_call"; noticeCode?: string | null | undefined; subject: string; taxYear?: number | null | undefined; formType?: string | null | undefined; receivedOn: string; responseDue?: string | null | undefined; path?: string | null | undefined; shareWithManager: boolean; note?: string | null | undefined }) {
  await assertTaxStaff(userId);
  if (i.path && !i.path.startsWith(`fund-setup-restricted/${i.offeringId}/irs/`)) throw new Error("That file does not belong to this fund.");
  assertNoRawTin({ subject: i.subject, note: i.note, code: i.noticeCode }, "IRS record");
  const { data, error } = await db().from("irs_correspondence").insert({
    offering_id: i.offeringId, direction: i.direction, notice_code: i.noticeCode?.slice(0, 60) ?? null, subject: i.subject.slice(0, 300),
    tax_year: i.taxYear ?? null, form_type: i.formType?.slice(0, 20) ?? null, received_on: i.receivedOn, response_due: i.responseDue || null,
    storage_path: i.path ?? null, share_with_manager: i.shareWithManager, recorded_by: userId,
  }).select("id").single();
  if (error) throw new Error(error.message);
  await db().from("irs_correspondence_events").insert({ correspondence_id: data.id, status: "open", note: i.note?.slice(0, 1000) ?? null, recorded_by: userId });
  return { id: data.id };
}

export async function updateIrsStatus(userId: string, i: { id: string; status: IrsStatus; note: string; path?: string | null | undefined }) {
  await assertTaxStaff(userId);
  if (!i.note.trim()) throw new Error("Add a short note about what happened.");
  assertNoRawTin({ note: i.note }, "IRS record");
  const { data: r } = await db().from("irs_correspondence").select("offering_id").eq("id", i.id).maybeSingle();
  if (!r) throw new Error("That IRS record was not found.");
  if (i.path && !i.path.startsWith(`fund-setup-restricted/${r.offering_id}/irs/`)) throw new Error("That file does not belong to this fund.");
  const { error } = await db().from("irs_correspondence_events").insert({ correspondence_id: i.id, status: i.status, note: i.note.slice(0, 1000), storage_path: i.path ?? null, recorded_by: userId });
  if (error) throw new Error(error.message);
  return { ok: true };
}

/** List 1065s for the detail picker. */
export async function list1065s(userId: string, i: { offeringId?: string | undefined }) {
  const actor = await taxActor(userId);
  let q = db().from("partnership_returns").select("id, offering_id, tax_year, version, status").order("tax_year", { ascending: false }).limit(200);
  if (!actor.isStaff) {
    if (!actor.offeringIds.length) return { returns: [] };
    q = q.in("offering_id", i.offeringId ? actor.offeringIds.filter((x) => x === i.offeringId) : actor.offeringIds);
  } else if (i.offeringId) q = q.eq("offering_id", i.offeringId);
  const { data } = await q;
  const fn = await fundNames(((data ?? []) as any[]).map((r) => r.offering_id));
  return { returns: ((data ?? []) as any[]).map((r) => ({ id: r.id, offeringId: r.offering_id, fundName: fn.get(r.offering_id) ?? "Fund", taxYear: r.tax_year, version: r.version, status: r.status })) };
}
