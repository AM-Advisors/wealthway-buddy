/**
 * Professional tax workspace: delegated tax professionals see, prepare and
 * review entity tax work (1065, 1042 / 1042-S, 1099) for Funds whose live
 * delegation carries the exact tax capability, plus individual returns they
 * are delegated to view.
 *
 * Authority comes only from canAct (live delegation + explicit capability +
 * scope). Preparing never implies approving; the approver must be a different
 * person from anyone who prepared or submitted the record. Nothing here files,
 * transmits, delivers, pays or moves money — those stay with Harmonious.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { canAct } from "@/lib/delegated-access.server";
import { recordTaxAccess, recordTaxEvent, assertTaxStaff } from "@/lib/tax-authz.server";

const db = () => supabaseAdmin as any;
const now = () => new Date().toISOString();
function fail(message: string): never {
  throw new Error(message);
}

export type ProTaxKind = "1065" | "1042" | "1099";
export type ProTaxAction = "mark_prepared" | "submit" | "approve" | "return";

const TABLE: Record<ProTaxKind, string> = {
  "1065": "partnership_returns",
  "1042": "form_1042_returns",
  "1099": "form_1099_records",
};

/** Professional-permitted moves only. Filing states are never reachable here. */
const MOVES: Record<ProTaxKind, Record<ProTaxAction, { from: string[]; to: string; cap: "prepare_entity_return" | "review_entity_return" }>> = {
  "1065": {
    mark_prepared: { from: ["draft"], to: "prepared", cap: "prepare_entity_return" },
    submit: { from: ["prepared"], to: "review", cap: "prepare_entity_return" },
    approve: { from: ["review"], to: "approved", cap: "review_entity_return" },
    return: { from: ["review"], to: "prepared", cap: "review_entity_return" },
  },
  "1042": {
    mark_prepared: { from: ["draft"], to: "prepared", cap: "prepare_entity_return" },
    submit: { from: ["prepared"], to: "review", cap: "prepare_entity_return" },
    approve: { from: ["review"], to: "approved", cap: "review_entity_return" },
    return: { from: ["review"], to: "prepared", cap: "review_entity_return" },
  },
  "1099": {
    mark_prepared: { from: [], to: "draft", cap: "prepare_entity_return" },
    submit: { from: ["draft"], to: "review", cap: "prepare_entity_return" },
    approve: { from: ["review"], to: "approved", cap: "review_entity_return" },
    return: { from: ["review"], to: "draft", cap: "review_entity_return" },
  },
};

export function allowedActions(kind: ProTaxKind, status: string, caps: { prepare: boolean; review: boolean }) {
  return (Object.entries(MOVES[kind]) as [ProTaxAction, (typeof MOVES)["1065"]["approve"]][])
    .filter(([, m]) => m.from.includes(status))
    .filter(([, m]) => (m.cap === "prepare_entity_return" ? caps.prepare : caps.review))
    .map(([a]) => a);
}

type FundCaps = { offeringId: string; view: boolean; prepare: boolean; review: boolean };

/** Funds this professional may see tax work for, from live fund-scoped delegations. */
async function delegatedFunds(userId: string): Promise<FundCaps[]> {
  const { data } = await db()
    .from("delegations")
    .select("scope_type, scope_id")
    .eq("delegate_user_id", userId)
    .eq("scope_type", "fund");
  const ids = [...new Set(((data ?? []) as any[]).map((d) => d.scope_id).filter(Boolean))] as string[];
  const out: FundCaps[] = [];
  for (const id of ids) {
    const ref = { type: "fund" as const, id };
    const [view, prepare, review] = await Promise.all([
      canAct(userId, "view_tax_returns", ref),
      canAct(userId, "prepare_entity_return", ref, { mutation: true }),
      canAct(userId, "review_entity_return", ref, { mutation: true }),
    ]);
    const caps = { offeringId: id, view: view.allowed, prepare: prepare.allowed, review: review.allowed };
    if (caps.view || caps.prepare || caps.review) out.push(caps);
  }
  return out;
}

async function touchedBy(table: string, id: string, userId: string) {
  const { data } = await db()
    .from("tax_events")
    .select("id")
    .eq("subject_table", table)
    .eq("subject_id", id)
    .eq("actor_user_id", userId)
    .in("event", ["professional_mark_prepared", "professional_submit"])
    .limit(1);
  return ((data ?? []) as any[]).length > 0;
}

export async function professionalTaxWorkspace(userId: string) {
  return buildWorkspace(userId, await delegatedFunds(userId), null);
}

/** Harmonious staff: every Fund, prepare + review (still maker-checker). */
export async function staffTaxWorkspace(userId: string) {
  await assertTaxStaff(userId);
  const { data } = await db().from("offerings").select("id");
  const funds = ((data ?? []) as any[]).map((o) => ({ offeringId: o.id as string, view: true, prepare: true, review: true }));
  return buildWorkspace(userId, funds, "all");
}

async function buildWorkspace(userId: string, funds: FundCaps[], individualScope: "all" | null) {
  const ids = funds.map((f) => f.offeringId);
  const capsFor = new Map(funds.map((f) => [f.offeringId, f]));
  const none = { data: [] as any[] };
  const [offerings, returns1065, returns1042, forms1042s, forms1099] = ids.length
    ? await Promise.all([
        db().from("offerings").select("id, name").in("id", ids),
        db().from("partnership_returns").select("id, offering_id, tax_year, status, filing_status, version, tax_income_cents, prepared_by, updated_at").in("offering_id", ids).neq("status", "superseded"),
        db().from("form_1042_returns").select("id, offering_id, tax_year, status, filing_status, version, control_totals, difference_cents, prepared_by, updated_at").in("offering_id", ids),
        db().from("form_1042s_records").select("id, offering_id, tax_year, status, income_code, chapter, country, gross_income_cents, withheld_cents").in("offering_id", ids).neq("status", "superseded"),
        db().from("form_1099_records").select("id, offering_id, tax_year, form_type, status, filing_status, recipient_name, total_amount_cents, withheld_cents, prepared_by, updated_at").in("offering_id", ids).neq("status", "superseded"),
      ])
    : [none, none, none, none, none];
  const fundName = new Map(((offerings.data ?? []) as any[]).map((o) => [o.id, o.name as string]));

  const entity = (kind: ProTaxKind, rows: any[], amount: (r: any) => number | null, label: (r: any) => string) =>
    rows.map((r) => {
      const caps = capsFor.get(r.offering_id)!;
      return {
        kind,
        id: r.id as string,
        offeringId: r.offering_id as string,
        fundName: fundName.get(r.offering_id) ?? "Fund",
        taxYear: r.tax_year as number,
        status: r.status as string,
        filingStatus: (r.filing_status as string) ?? null,
        label: label(r),
        amountCents: amount(r),
        updatedAt: (r.updated_at as string) ?? null,
        canPrepare: caps.prepare,
        canReview: caps.review,
        actions: allowedActions(kind, r.status, caps),
      };
    });

  // Individual returns: person-scoped delegations with view_tax_returns.
  const { data: personDelegations } = await db()
    .from("delegations")
    .select("principal_user_id")
    .eq("delegate_user_id", userId)
    .eq("scope_type", "person");
  const principals: string[] = [];
  if (individualScope !== "all") for (const p of [...new Set(((personDelegations ?? []) as any[]).map((d) => d.principal_user_id))] as string[]) {
    if ((await canAct(userId, "view_tax_returns", { type: "person", id: p })).allowed) principals.push(p);
  }
  const { data: individual } = individualScope === "all"
    ? await db().from("individual_tax_returns").select("id, tax_year, primary_user_id, status, filing_status_code, updated_at").neq("status", "superseded").limit(500)
    : principals.length
    ? await db().from("individual_tax_returns").select("id, tax_year, primary_user_id, status, filing_status_code, updated_at").in("primary_user_id", principals).neq("status", "superseded")
    : none;
  if (individualScope === "all") principals.push(...new Set(((individual ?? []) as any[]).map((r) => r.primary_user_id as string)));
  const { data: people } = principals.length
    ? await db().from("profiles").select("user_id, legal_name, email").in("user_id", principals)
    : none;
  const nameOf = new Map(((people ?? []) as any[]).map((p) => [p.user_id, (p.legal_name || p.email || "Taxpayer") as string]));

  await recordTaxAccess({
    actorUserId: userId,
    capability: "view_tax_returns",
    resourceTable: individualScope === "all" ? "staff_tax_workspace" : "professional_tax_workspace",
    action: "read",
    allowed: true,
  });

  return {
    funds: funds.map((f) => ({ ...f, name: fundName.get(f.offeringId) ?? "Fund" })),
    returns1065: entity("1065", (returns1065.data ?? []) as any[], (r) => r.tax_income_cents ?? null, (r) => `Form 1065 · v${r.version ?? 1}`),
    returns1042: entity("1042", (returns1042.data ?? []) as any[], (r) => r.control_totals?.withheldCents ?? null, (r) => `Form 1042 · v${r.version ?? 1}`),
    forms1042s: ((forms1042s.data ?? []) as any[]).map((r) => ({
      id: r.id as string,
      fundName: fundName.get(r.offering_id) ?? "Fund",
      taxYear: r.tax_year as number,
      status: r.status as string,
      label: `Income code ${r.income_code ?? "—"} · Chapter ${r.chapter ?? "—"}${r.country ? ` · ${r.country}` : ""}`,
      grossCents: (r.gross_income_cents as number) ?? null,
      withheldCents: (r.withheld_cents as number) ?? null,
    })),
    forms1099: entity("1099", (forms1099.data ?? []) as any[], (r) => r.total_amount_cents ?? null, (r) => `${r.form_type ?? "1099"} · ${r.recipient_name ?? "Recipient"}`),
    individualReturns: ((individual ?? []) as any[]).map((r) => ({
      id: r.id as string,
      taxpayer: nameOf.get(r.primary_user_id) ?? "Taxpayer",
      taxYear: r.tax_year as number,
      status: r.status as string,
      updatedAt: (r.updated_at as string) ?? null,
    })),
  };
}

export async function staffTaxAction(userId: string, input: { kind: ProTaxKind; id: string; action: ProTaxAction; note?: string | undefined }) {
  await assertTaxStaff(userId);
  return professionalTaxAction(userId, input, true);
}

export async function staffTaxHistory(userId: string, input: { kind: ProTaxKind; id: string }) {
  await assertTaxStaff(userId);
  return professionalTaxHistory(userId, input, true);
}

export async function professionalTaxAction(
  userId: string,
  input: { kind: ProTaxKind; id: string; action: ProTaxAction; note?: string | undefined },
  staff = false,
) {
  const table = TABLE[input.kind];
  const move = MOVES[input.kind][input.action];
  const { data: row } = await db().from(table).select("*").eq("id", input.id).maybeSingle();
  if (!row) fail("That tax record was not found.");
  const decision: { allowed: boolean; reason?: string | null; delegationId?: string | null } = staff
    ? { allowed: true, delegationId: null }
    : await canAct(userId, move.cap, { type: "fund", id: row.offering_id }, { mutation: true });
  if (!decision.allowed) {
    await recordTaxAccess({ actorUserId: userId, capability: move.cap, resourceTable: table, resourceId: input.id, action: input.action, allowed: false, reason: decision.reason ?? null });
    fail(`Forbidden: ${decision.reason ?? "your delegation does not allow this."}`);
  }
  if (!move.from.includes(row.status)) fail(`This form is ${row.status}; that step isn't available.`);
  if (input.action === "return" && !input.note?.trim()) fail("Say what needs to change before returning it.");
  if (input.action === "approve") {
    if (row.prepared_by === userId || (await touchedBy(table, input.id, userId))) {
      fail("A different person must approve a return or form you prepared or submitted.");
    }
  }

  const patch: Record<string, unknown> = { status: move.to, updated_at: now() };
  if (move.to === "review") patch["reviewed_by"] = null;
  if (input.action === "approve") {
    patch["approved_by"] = userId;
    patch["reviewed_by"] = userId;
    if (input.kind === "1065") {
      patch["approved_at"] = now();
      patch["reviewed_at"] = now();
    }
  }
  if (input.kind === "1065" && input.action === "mark_prepared") patch["prepared_at"] = now();

  const { data: updated, error } = await db()
    .from(table)
    .update(patch)
    .eq("id", input.id)
    .eq("status", row.status)
    .select("id, status")
    .maybeSingle();
  if (error) fail(error.message);
  if (!updated) fail("Someone else changed this form. Refresh and try again.");

  await recordTaxEvent({
    subjectTable: table,
    subjectId: input.id,
    taxYear: row.tax_year,
    offeringId: row.offering_id,
    event: `professional_${input.action}`,
    fromStatus: row.status,
    toStatus: move.to,
    detail: input.note ? { note: input.note } : {},
    actorUserId: userId,
    delegationId: decision.delegationId ?? null,
  });
  return updated;
}

export async function professionalTaxHistory(userId: string, input: { kind: ProTaxKind; id: string }, staff = false) {
  const table = TABLE[input.kind];
  const { data: row } = await db().from(table).select("offering_id").eq("id", input.id).maybeSingle();
  if (!row) fail("That tax record was not found.");
  if (!staff && !(await canAct(userId, "view_tax_returns", { type: "fund", id: row.offering_id })).allowed) {
    fail("Forbidden: your delegation does not cover this Fund's tax returns.");
  }
  const { data } = await db()
    .from("tax_events")
    .select("id, event, from_status, to_status, detail, created_at")
    .eq("subject_table", table)
    .eq("subject_id", input.id)
    .order("created_at", { ascending: false });
  return ((data ?? []) as any[]).map((e) => ({
    id: e.id as string,
    event: String(e.event).replace(/^professional_/, "").replace(/_/g, " "),
    from: e.from_status as string | null,
    to: e.to_status as string | null,
    note: (e.detail?.note as string) ?? null,
    at: e.created_at as string,
  }));
}
