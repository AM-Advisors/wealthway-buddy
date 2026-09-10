import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const STAFF_ROLES = [
  "admin",
  "super_admin",
  "operations",
  "legal",
  "compliance",
  "fund_administration",
  "tax",
  "finance",
  "client_success",
  "executive",
];

/** Legal, compliance, finance, client success, CEO/CRO (executive) or admin. */
const CONTRACT_ROLES = [
  "admin",
  "super_admin",
  "legal",
  "client_success",
  "compliance",
  "finance",
  "executive",
];

export const SETTLEMENT_STATES = [
  { value: "open", label: "Still open" },
  { value: "settled", label: "Settled" },
  { value: "waived", label: "Waived" },
  { value: "disputed", label: "Disputed" },
] as const;

export const CASE_STAGES = [
  { value: "open", label: "Notice received" },
  { value: "winding_down", label: "Winding down" },
  { value: "settlement", label: "Final settlement" },
  { value: "data_delivered", label: "Data delivered" },
  { value: "closed", label: "Closed" },
] as const;

export type SettlementLine = {
  key: string;
  label: string;
  basis: string | null;
  amountCents: number | null;
  state: string;
  note: string | null;
  decidedAt: string | null;
};

export type ExportDelivery = {
  deliveredOn: string;
  method: string;
  recipient: string;
  contents: string | null;
  recordedAt: string;
} | null;

type Steps = {
  settlement?: SettlementLine[];
  export?: ExportDelivery;
  endDateReason?: string | null;
  retentionReviewedAt?: string | null;
  accessRemovedAt?: string | null;
};


type Who = { userId: string; roles: string[]; isStaff: boolean; canManage: boolean };

async function whoIs(context: any): Promise<Who> {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  const roles = ((data ?? []) as any[]).map((r) => String(r.role));
  return {
    userId: context.userId,
    roles,
    isStaff: roles.some((r) => STAFF_ROLES.includes(r)),
    canManage: roles.some((r) => CONTRACT_ROLES.includes(r)),
  };
}

async function requireStaff(context: any) {
  const who = await whoIs(context);
  if (!who.isStaff) throw new Error("Forbidden: this area is for the Harmonious team.");
  return who;
}

async function requireAuthority(context: any) {
  const who = await whoIs(context);
  if (!who.canManage) {
    throw new Error(
      "Forbidden: managing a termination needs legal, compliance, finance, client success, CEO, CRO or admin authority.",
    );
  }
  return who;
}

async function audit(
  context: any,
  who: Who,
  entry: {
    action: string;
    target?: string | null;
    clientId?: string | null;
    previous?: unknown;
    next?: unknown;
  },
) {
  await context.supabase.from("contract_audit_events").insert({
    actor_id: who.userId,
    actor_role: who.roles.join(", ") || null,
    client_id: entry.clientId ?? null,
    area: "termination",
    action: entry.action,
    target: entry.target ?? null,
    previous_value: (entry.previous ?? null) as any,
    new_value: (entry.next ?? null) as any,
    source: "web",
  });
}

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function stepsOf(row: any): Steps {
  return (row?.steps ?? {}) as Steps;
}

function daysRemaining(endDate: string | null) {
  if (!endDate) return null;
  const end = new Date(`${endDate}T00:00:00Z`).getTime();
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").getTime();
  return Math.round((end - today) / 86400000);
}

function blockers(row: any) {
  const steps = stepsOf(row);
  const list: string[] = [];
  const lines = steps.settlement ?? [];
  if (lines.some((l) => l.state === "open")) list.push("Amounts still open");
  if (lines.some((l) => l.state === "disputed" && !l.note)) list.push("A disputed amount needs a reason");
  if (!steps.export) list.push("Data export delivery not recorded");
  if (!steps.retentionReviewedAt) list.push("Retained records not reviewed");
  if (!steps.accessRemovedAt) list.push("Client access not removed");
  return list;
}


/* ------------------------------------------------------------------ reads */

export const listOffboardingCases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const who = await requireStaff(context);
    const [{ data: cases }, { data: clients }, { data: sows }] = await Promise.all([
      context.supabase.from("offboarding_cases").select("*").order("created_at", { ascending: false }),
      context.supabase.from("clients").select("id, name, status"),
      context.supabase.from("client_sows").select("id, title, status, sow_type, notice_days, effective_date"),
    ]);
    const clientMap = new Map(((clients ?? []) as any[]).map((c) => [c.id, c]));
    const sowMap = new Map(((sows ?? []) as any[]).map((s) => [s.id, s]));
    return {
      canManage: who.canManage,
      clients: ((clients ?? []) as any[]).map((c) => ({ id: c.id, name: c.name, status: c.status })),
      sows: ((sows ?? []) as any[]).map((s) => ({
        id: s.id,
        title: s.title,
        status: s.status,
        sowType: s.sow_type,
        noticeDays: s.notice_days,
      })),
      cases: ((cases ?? []) as any[]).map((row) => ({
        id: row.id,
        clientId: row.client_id,
        clientName: clientMap.get(row.client_id)?.name ?? "Unknown client",
        sowTitle: row.sow_id ? (sowMap.get(row.sow_id)?.title ?? null) : null,
        status: row.status,
        initiatedBy: row.initiated_by,
        noticeReceivedOn: row.notice_received_on,
        noticeDays: row.notice_days,
        effectiveEndDate: row.effective_end_date,
        daysRemaining: daysRemaining(row.effective_end_date),
        blockers: row.status === "closed" ? [] : blockers(row),
      })),
    };
  });

const caseDetail = (row: any, client: any, sow: any, retention: any[]) => {
  const steps = stepsOf(row);
  return {
    id: row.id,
    clientId: row.client_id,
    clientName: client?.name ?? "Unknown client",
    clientLegalName: client?.legal_name ?? null,
    sowId: row.sow_id,
    sow: sow
      ? {
          id: sow.id,
          title: sow.title,
          sowType: sow.sow_type,
          status: sow.status,
          effectiveDate: sow.effective_date,
          noticeDays: sow.notice_days,
        }
      : null,
    status: row.status,
    initiatedBy: row.initiated_by,
    noticeReceivedOn: row.notice_received_on,
    noticeDays: row.notice_days,
    effectiveEndDate: row.effective_end_date,
    daysRemaining: daysRemaining(row.effective_end_date),
    endDateReason: steps.endDateReason ?? null,
    note: row.note,
    settlement: steps.settlement ?? [],
    exportDelivery: steps.export ?? null,
    retentionReviewedAt: steps.retentionReviewedAt ?? null,
    closedAt: row.closed_at,
    blockers: row.status === "closed" ? [] : blockers(row),
    retention: retention.map((r) => ({
      id: r.id,
      label: r.record_label,
      classification: r.data_classification,
      category: r.retention_category,
      status: r.status,
      retainUntil: r.retain_until,
      legalHold: r.legal_hold,
      holdReason: r.hold_reason,
      note: r.note,
    })),
  };
};

export const getOffboardingCase = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const who = await requireStaff(context);
    const { data: row, error } = await context.supabase
      .from("offboarding_cases")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("That termination record is not available.");

    const [{ data: client }, { data: sow }, { data: retention }, { data: pricing }, { data: sows }] =
      await Promise.all([
        context.supabase.from("clients").select("*").eq("id", row.client_id).maybeSingle(),
        row.sow_id
          ? context.supabase.from("client_sows").select("*").eq("id", row.sow_id).maybeSingle()
          : Promise.resolve({ data: null }),
        context.supabase
          .from("record_retention")
          .select("*")
          .eq("client_id", row.client_id)
          .order("created_at", { ascending: false }),
        context.supabase.from("client_pricing").select("*").eq("client_id", row.client_id),
        context.supabase
          .from("client_sows")
          .select("id, title, status, sow_type, notice_days, effective_date")
          .eq("client_id", row.client_id),
      ]);

    return {
      canManage: who.canManage,
      case: caseDetail(row, client, sow, (retention ?? []) as any[]),
      rates: ((pricing ?? []) as any[]).map((p) => ({
        key: p.id,
        label: p.label,
        basis: p.pricing_model,
        amountCents: p.contracted_cents ?? p.standard_cents ?? null,
      })),
      sows: ((sows ?? []) as any[]).map((s) => ({
        id: s.id,
        title: s.title,
        status: s.status,
        sowType: s.sow_type,
        noticeDays: s.notice_days,
      })),
    };
  });

/** The client's own read-only view of their wind-down. */
export const getMyOffboarding = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: rows } = await context.supabase
      .from("offboarding_cases")
      .select("*")
      .order("created_at", { ascending: false });
    const row = ((rows ?? []) as any[])[0];
    if (!row) return { case: null };

    const [{ data: client }, { data: sow }, { data: retention }] = await Promise.all([
      context.supabase.from("clients").select("id, name").eq("id", row.client_id).maybeSingle(),
      row.sow_id
        ? context.supabase.from("client_sows").select("*").eq("id", row.sow_id).maybeSingle()
        : Promise.resolve({ data: null }),
      context.supabase
        .from("record_retention")
        .select("*")
        .eq("client_id", row.client_id)
        .order("created_at", { ascending: false }),
    ]);

    const steps = stepsOf(row);
    const lines = steps.settlement ?? [];
    return {
      case: {
        id: row.id,
        clientId: row.client_id,
        clientName: client?.name ?? "",
        status: row.status,
        sowTitle: sow?.title ?? null,
        noticeReceivedOn: row.notice_received_on,
        effectiveEndDate: row.effective_end_date,
        daysRemaining: daysRemaining(row.effective_end_date),
        openAmounts: lines.filter((l) => l.state === "open").length,
        openAmountCents: lines
          .filter((l) => l.state === "open")
          .reduce((sum, l) => sum + (l.amountCents ?? 0), 0),
        exportDelivered: Boolean(steps.export),
        exportDeliveredOn: steps.export?.deliveredOn ?? null,
        retention: ((retention ?? []) as any[]).map((r) => ({
          id: r.id,
          label: r.record_label,
          category: r.retention_category,
          retainUntil: r.retain_until,
          legalHold: r.legal_hold,
        })),
      },
    };
  });

/* --------------------------------------------------------------- mutations */

export const openOffboardingCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        clientId: z.string().uuid(),
        sowId: z.string().uuid().nullable().optional(),
        initiatedBy: z.enum(["client", "harmonious"]),
        noticeReceivedOn: z.string().min(10),
        note: z.string().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await requireAuthority(context);

    let noticeDays = 60;
    if (data.sowId) {
      const { data: sow } = await context.supabase
        .from("client_sows")
        .select("notice_days")
        .eq("id", data.sowId)
        .maybeSingle();
      if (sow?.notice_days) noticeDays = sow.notice_days;
    }

    const { data: row, error } = await context.supabase
      .from("offboarding_cases")
      .insert({
        client_id: data.clientId,
        sow_id: data.sowId ?? null,
        initiated_by: data.initiatedBy,
        notice_received_on: data.noticeReceivedOn,
        notice_days: noticeDays,
        effective_end_date: addDays(data.noticeReceivedOn, noticeDays),
        status: "open",
        note: data.note ?? null,
        created_by: who.userId,
        steps: {},
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await audit(context, who, {
      action: "notice recorded",
      clientId: data.clientId,
      target: data.sowId ?? "whole engagement",
      next: { noticeReceivedOn: data.noticeReceivedOn, noticeDays, initiatedBy: data.initiatedBy },
    });
    return { id: row.id };
  });

export const updateOffboardingCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        sowId: z.string().uuid().nullable().optional(),
        status: z.enum(["open", "winding_down", "settlement", "data_delivered"]).optional(),
        effectiveEndDate: z.string().min(10).optional(),
        endDateReason: z.string().max(500).optional(),
        note: z.string().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await requireAuthority(context);
    const { data: row } = await context.supabase
      .from("offboarding_cases")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("That termination record is not available.");
    if (row.status === "closed") throw new Error("This termination is closed and can no longer change.");

    const patch: Record<string, unknown> = {};
    if (data.sowId !== undefined) patch['sow_id'] = data.sowId;
    if (data.status) patch['status'] = data.status;
    if (data.note !== undefined) patch['note'] = data.note;

    const steps = stepsOf(row);
    if (data.effectiveEndDate && data.effectiveEndDate !== row.effective_end_date) {
      if (!data.endDateReason?.trim()) {
        throw new Error("Give a reason for changing the end date.");
      }
      patch['effective_end_date'] = data.effectiveEndDate;
      steps.endDateReason = data.endDateReason.trim();
      patch['steps'] = steps;
    }

    const { error } = await context.supabase
      .from("offboarding_cases")
      .update(patch as any)
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await audit(context, who, {
      action: "termination updated",
      clientId: row.client_id,
      previous: {
        status: row.status,
        endDate: row.effective_end_date,
        sowId: row.sow_id,
      },
      next: patch,
    });
    return { ok: true };
  });

export const seedSettlementLines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const who = await requireAuthority(context);
    const { data: row } = await context.supabase
      .from("offboarding_cases")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("That termination record is not available.");
    if (row.status === "closed") throw new Error("This termination is closed and can no longer change.");

    const { data: pricing } = await context.supabase
      .from("client_pricing")
      .select("*")
      .eq("client_id", row.client_id);

    const steps = stepsOf(row);
    const existing = new Map((steps.settlement ?? []).map((l) => [l.key, l]));
    const lines: SettlementLine[] = ((pricing ?? []) as any[]).map((p) => {
      const prior = existing.get(p.id);
      return (
        prior ?? {
          key: p.id,
          label: p.label,
          basis: p.pricing_model ?? null,
          amountCents: p.contracted_cents ?? p.standard_cents ?? null,
          state: "open",
          note: null,
          decidedAt: null,
        }
      );
    });
    for (const [key, line] of existing) {
      if (!lines.some((l) => l.key === key)) lines.push(line);
    }
    steps.settlement = lines;

    const { error } = await context.supabase
      .from("offboarding_cases")
      .update({ steps })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await audit(context, who, {
      action: "settlement list built from agreed rates",
      clientId: row.client_id,
      next: { lines: lines.length },
    });
    return { count: lines.length };
  });

export const saveSettlementLine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        key: z.string().min(1),
        state: z.enum(["open", "settled", "waived", "disputed"]),
        amountCents: z.number().int().min(0).nullable().optional(),
        note: z.string().max(1000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await requireAuthority(context);
    const { data: row } = await context.supabase
      .from("offboarding_cases")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("That termination record is not available.");
    if (row.status === "closed") throw new Error("This termination is closed and can no longer change.");
    if ((data.state === "disputed" || data.state === "waived") && !data.note?.trim()) {
      throw new Error("Add a note explaining this decision.");
    }

    const steps = stepsOf(row);
    const lines = steps.settlement ?? [];
    const line = lines.find((l) => l.key === data.key);
    if (!line) throw new Error("That line is no longer on this termination.");
    const previous = { ...line };
    line.state = data.state;
    if (data.amountCents !== undefined) line.amountCents = data.amountCents;
    line.note = data.note?.trim() || null;
    line.decidedAt = new Date().toISOString();
    steps.settlement = lines;

    const { error } = await context.supabase
      .from("offboarding_cases")
      .update({ steps })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await audit(context, who, {
      action: "amount decision recorded",
      clientId: row.client_id,
      target: line.label,
      previous,
      next: line,
    });
    return { ok: true };
  });

export const recordExportDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        deliveredOn: z.string().min(10),
        method: z.string().min(2).max(120),
        recipient: z.string().min(2).max(200),
        contents: z.string().max(1000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await requireAuthority(context);
    const { data: row } = await context.supabase
      .from("offboarding_cases")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("That termination record is not available.");
    if (row.status === "closed") throw new Error("This termination is closed and can no longer change.");

    const steps = stepsOf(row);
    steps.export = {
      deliveredOn: data.deliveredOn,
      method: data.method.trim(),
      recipient: data.recipient.trim(),
      contents: data.contents?.trim() || null,
      recordedAt: new Date().toISOString(),
    };

    const { error } = await context.supabase
      .from("offboarding_cases")
      .update({ steps, status: row.status === "closed" ? row.status : "data_delivered" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await audit(context, who, {
      action: "data export delivered",
      clientId: row.client_id,
      next: steps.export,
    });
    return { ok: true };
  });

export const saveRetentionRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        recordId: z.string().uuid().nullable().optional(),
        caseId: z.string().uuid(),
        clientId: z.string().uuid(),
        label: z.string().min(2).max(200),
        classification: z.string().min(2).max(80),
        category: z.string().min(2).max(80),
        status: z.string().min(2).max(40),
        retainUntil: z.string().nullable().optional(),
        legalHold: z.boolean(),
        holdReason: z.string().max(500).optional(),
        note: z.string().max(1000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await requireAuthority(context);
    if (data.legalHold && !data.holdReason?.trim()) {
      throw new Error("Give the reason this record is on hold.");
    }
    const values = {
      client_id: data.clientId,
      record_label: data.label.trim(),
      data_classification: data.classification,
      retention_category: data.category,
      status: data.status,
      retain_until: data.retainUntil || null,
      legal_hold: data.legalHold,
      hold_reason: data.holdReason?.trim() || null,
      note: data.note?.trim() || null,
      updated_by: who.userId,
    };

    if (data.recordId) {
      const { error } = await context.supabase
        .from("record_retention")
        .update(values)
        .eq("id", data.recordId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase.from("record_retention").insert(values);
      if (error) throw new Error(error.message);
    }

    await audit(context, who, {
      action: data.recordId ? "retained record updated" : "retained record added",
      clientId: data.clientId,
      target: data.label,
      next: values,
    });
    return { ok: true };
  });

export const markRetentionReviewed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const who = await requireAuthority(context);
    const { data: row } = await context.supabase
      .from("offboarding_cases")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("That termination record is not available.");
    const steps = stepsOf(row);
    steps.retentionReviewedAt = new Date().toISOString();
    const { error } = await context.supabase
      .from("offboarding_cases")
      .update({ steps })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(context, who, {
      action: "retained records reviewed",
      clientId: row.client_id,
      next: { reviewedAt: steps.retentionReviewedAt },
    });
    return { ok: true };
  });

export const closeOffboardingCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), note: z.string().max(2000).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await requireAuthority(context);
    const { data: row } = await context.supabase
      .from("offboarding_cases")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("That termination record is not available.");
    if (row.status === "closed") return { ok: true };

    const open = blockers(row);
    if (open.length) throw new Error(`Not ready to close: ${open.join("; ")}.`);

    const { error } = await context.supabase
      .from("offboarding_cases")
      .update({
        status: "closed",
        closed_by: who.userId,
        closed_at: new Date().toISOString(),
        note: data.note ?? row.note,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await audit(context, who, {
      action: "termination closed",
      clientId: row.client_id,
      previous: { status: row.status },
      next: { status: "closed" },
    });
    return { ok: true };
  });

/* ------------------------------------------------------------------ export */

function csv(rows: (string | number | null)[][]) {
  return rows
    .map((row) => row.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

/** Builds the client's data export as CSV text, one entry per dataset. */
export const exportClientData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: client } = await context.supabase
      .from("clients")
      .select("*")
      .eq("id", data.clientId)
      .maybeSingle();
    if (!client) throw new Error("That client's records are not available to you.");

    const { data: funds } = await context.supabase
      .from("offerings")
      .select("id, name, reg_type, is_open, target_raise_cents, created_at")
      .eq("client_id", data.clientId);
    const fundIds = ((funds ?? []) as any[]).map((f) => f.id);
    const fundName = new Map(((funds ?? []) as any[]).map((f) => [f.id, f.name]));

    const [{ data: apps }, { data: audits }] = await Promise.all([
      fundIds.length
        ? context.supabase
            .from("investor_applications")
            .select(
              "id, offering_id, user_id, status, kyc_status, aml_status, accreditation_status, documents_status, funding_status, commitment_cents, created_at",
            )
            .in("offering_id", fundIds)
        : Promise.resolve({ data: [] }),
      context.supabase
        .from("contract_audit_events")
        .select("created_at, area, action, target, actor_role")
        .eq("client_id", data.clientId)
        .order("created_at", { ascending: false })
        .limit(2000),
    ]);

    const appIds = ((apps ?? []) as any[]).map((a) => a.id);
    const [{ data: payments }, { data: docs }] = await Promise.all([
      appIds.length
        ? context.supabase
            .from("payments")
            .select("application_id, method, amount_cents, status, confirmed_on, created_at")
            .in("application_id", appIds)
        : Promise.resolve({ data: [] }),
      appIds.length
        ? context.supabase
            .from("investor_documents")
            .select("application_id, kind, status, created_at")
            .in("application_id", appIds)
        : Promise.resolve({ data: [] }),
    ]);

    const files = [
      {
        name: "client.csv",
        content: csv([
          ["Name", "Legal name", "Status", "MSA signed on", "MSA version", "Primary contact"],
          [
            client.name,
            client.legal_name,
            client.status,
            client.msa_signed_on,
            client.msa_version,
            client.primary_contact_name,
          ],
        ]),
      },
      {
        name: "funds.csv",
        content: csv([
          ["Fund", "Exemption", "Open", "Target raise", "Created"],
          ...((funds ?? []) as any[]).map((f) => [
            f.name,
            f.reg_type,
            f.is_open ? "Yes" : "No",
            f.target_raise_cents ? (f.target_raise_cents / 100).toFixed(2) : "",
            f.created_at,
          ]),
        ]),
      },
      {
        name: "investors.csv",
        content: csv([
          [
            "Application",
            "Fund",
            "Status",
            "Identity",
            "Screening",
            "Accreditation",
            "Documents",
            "Funding",
            "Commitment",
            "Created",
          ],
          ...((apps ?? []) as any[]).map((a) => [
            a.id,
            fundName.get(a.offering_id) ?? "",
            a.status,
            a.kyc_status,
            a.aml_status,
            a.accreditation_status,
            a.documents_status,
            a.funding_status,
            a.commitment_cents ? (a.commitment_cents / 100).toFixed(2) : "",
            a.created_at,
          ]),
        ]),
      },
      {
        name: "funding.csv",
        content: csv([
          ["Application", "Method", "Amount", "Status", "Confirmed on", "Created"],
          ...((payments ?? []) as any[]).map((p) => [
            p.application_id,
            p.method,
            p.amount_cents ? (p.amount_cents / 100).toFixed(2) : "",
            p.status,
            p.confirmed_on,
            p.created_at,
          ]),
        ]),
      },
      {
        name: "documents.csv",
        content: csv([
          ["Application", "Document", "Status", "Created"],
          ...((docs ?? []) as any[]).map((d) => [d.application_id, d.kind, d.status, d.created_at]),
        ]),
      },
      {
        name: "audit-trail.csv",
        content: csv([
          ["When", "Area", "Action", "Target", "Acted by role"],
          ...((audits ?? []) as any[]).map((e) => [
            e.created_at,
            e.area,
            e.action,
            e.target,
            e.actor_role,
          ]),
        ]),
      },
    ];

    return { clientName: client.name as string, files };
  });
