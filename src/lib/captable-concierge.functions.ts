import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Harmonious CapTable — migration concierge ("have Harmonious do it for me").
 *
 * The founder hands their export over, a named specialist picks it up and works
 * it, anything unclear comes back to the founder as a question, and the founder
 * approves the prepared batch before a single share is recorded.
 */

export const CONCIERGE_STAGES = [
  { key: "received", label: "Received" },
  { key: "assigned", label: "Assigned" },
  { key: "preparing", label: "In preparation" },
  { key: "awaiting_founder", label: "Questions for you" },
  { key: "founder_review", label: "Ready for your review" },
  { key: "recorded", label: "Recorded" },
] as const;

export type ConciergeStage = (typeof CONCIERGE_STAGES)[number]["key"] | "cancelled";

export function conciergeStageLabel(stage: string) {
  if (stage === "cancelled") return "Cancelled";
  return CONCIERGE_STAGES.find((s) => s.key === stage)?.label ?? stage;
}

const stageEnum = z.enum([
  "received",
  "assigned",
  "preparing",
  "awaiting_founder",
  "founder_review",
  "recorded",
  "cancelled",
]);

/* ------------------------------------------------------------------ helpers */

async function isStaff(context: any) {
  const { data } = await context.supabase.rpc("ct_is_staff");
  return Boolean(data);
}

/** Staff who may assign, work and record a case. */
async function assertSpecialist(context: any) {
  if (!(await isStaff(context))) {
    throw new Error("Only Harmonious staff can work a migration concierge case.");
  }
}

async function assertFounder(context: any, companyId: string) {
  const { data } = await context.supabase.rpc("ct_can_manage", { _company_id: companyId });
  if (!data) throw new Error("You do not have authority over this cap table.");
}

async function recordEvent(
  context: any,
  entry: { companyId: string; action: string; entityId?: string | null; next?: unknown; reason?: string | null },
) {
  await context.supabase.from("ct_events").insert({
    company_id: entry.companyId,
    actor_id: context.userId,
    action: entry.action,
    entity_type: "migration",
    entity_id: entry.entityId ?? null,
    new_state: (entry.next ?? null) as any,
    reason: entry.reason ?? null,
  });
}

async function loadCase(context: any, caseId: string) {
  const { data } = await context.supabase
    .from("ct_concierge_cases")
    .select("*")
    .eq("id", caseId)
    .maybeSingle();
  if (!data) throw new Error("That concierge case could not be found.");
  return data as any;
}

/** Names for the staff shown against a case. */
async function peopleByIds(context: any, ids: Array<string | null | undefined>) {
  const wanted = Array.from(new Set(ids.filter(Boolean) as string[]));
  if (!wanted.length) return new Map<string, { name: string; email: string | null }>();
  const { data } = await context.supabase
    .from("profiles")
    .select("user_id, legal_name, email")
    .in("user_id", wanted);
  return new Map(
    ((data ?? []) as any[]).map((p) => [
      String(p.user_id),
      { name: (p.legal_name as string | null) || "Harmonious", email: (p.email as string | null) ?? null },
    ]),
  );
}

function shapeException(row: any, who: Map<string, { name: string; email: string | null }>) {
  return {
    id: row.id as string,
    rowId: (row.migration_row_id as string | null) ?? null,
    question: row.question as string,
    detail: (row.detail as string | null) ?? null,
    status: row.status as "open" | "answered" | "resolved",
    response: (row.founder_response as string | null) ?? null,
    respondedAt: (row.responded_at as string | null) ?? null,
    resolvedAt: (row.resolved_at as string | null) ?? null,
    raisedBy: row.raised_by ? (who.get(String(row.raised_by))?.name ?? null) : null,
    createdAt: row.created_at as string,
  };
}

function shapeCase(row: any, who: Map<string, { name: string; email: string | null }>) {
  return {
    id: row.id as string,
    migrationId: row.migration_id as string,
    companyId: row.company_id as string,
    stage: row.stage as ConciergeStage,
    assignedTo: (row.assigned_to as string | null) ?? null,
    specialist: row.assigned_to ? (who.get(String(row.assigned_to))?.name ?? "Harmonious") : null,
    assignedAt: (row.assigned_at as string | null) ?? null,
    targetDate: (row.target_date as string | null) ?? null,
    priority: row.priority as string,
    founderNote: (row.founder_note as string | null) ?? null,
    contactName: (row.contact_name as string | null) ?? null,
    contactEmail: (row.contact_email as string | null) ?? null,
    preparedSummary: (row.prepared_summary ?? null) as Record<string, number> | null,
    sentForReviewAt: (row.sent_for_review_at as string | null) ?? null,
    reviewStatus: row.review_status as "pending" | "approved" | "changes_requested",
    reviewedAt: (row.reviewed_at as string | null) ?? null,
    reviewNote: (row.review_note as string | null) ?? null,
    recordedAt: (row.recorded_at as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

async function notifyFounder(
  context: any,
  companyId: string,
  alert: { headline: string; intro: string; eventKey: string; details?: { label: string; value: string }[] },
) {
  try {
    const { data: company } = await context.supabase
      .from("ct_companies")
      .select("client_id")
      .eq("id", companyId)
      .maybeSingle();
    const clientId = (company?.client_id as string | null) ?? null;
    if (!clientId) return;
    const { notifyClientAdmins } = await import("@/lib/client-notify.server");
    await notifyClientAdmins(clientId, {
      headline: alert.headline,
      intro: alert.intro,
      details: alert.details ?? [],
      actionLabel: "Open your cap table",
      actionPath: "/client/cap-table",
      eventKey: alert.eventKey,
    });
  } catch (err) {
    console.error("[captable-concierge] notify failed", alert.eventKey, err);
  }
}

/* ------------------------------------------------------------ founder side */

export const startConciergeCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        migrationId: z.string().uuid(),
        note: z.string().trim().max(2000).optional().nullable(),
        contactName: z.string().trim().max(160).optional().nullable(),
        contactEmail: z.string().trim().email().max(255).optional().nullable(),
        priority: z.enum(["standard", "urgent"]).default("standard"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: batch } = await supabase
      .from("ct_migrations")
      .select("id, company_id, status")
      .eq("id", data.migrationId)
      .maybeSingle();
    if (!batch) throw new Error("That uploaded file could not be found.");
    if (batch.status === "imported") throw new Error("This batch has already been recorded.");
    const companyId = batch.company_id as string;
    await assertFounder(context, companyId);

    const { data: existing } = await supabase
      .from("ct_concierge_cases")
      .select("id")
      .eq("migration_id", data.migrationId)
      .maybeSingle();
    if (existing) throw new Error("We are already looking after this file for you.");

    const { data: created, error } = await supabase
      .from("ct_concierge_cases")
      .insert({
        migration_id: data.migrationId,
        company_id: companyId,
        stage: "received",
        priority: data.priority,
        founder_note: data.note || null,
        contact_name: data.contactName || null,
        contact_email: data.contactEmail || null,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await supabase
      .from("ct_migrations")
      .update({
        status: "in_review",
        concierge_requested_at: new Date().toISOString(),
        concierge_note: data.note || null,
      })
      .eq("id", data.migrationId);

    await recordEvent(context, {
      companyId,
      action: "migration.concierge_started",
      entityId: data.migrationId,
      reason: data.note || "Harmonious asked to prepare this migration",
    });

    return { ok: true, caseId: created.id as string };
  });

/** Everything the founder sees about their own case. Internal notes excluded. */
export const getMyConciergeCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ migrationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row } = await supabase
      .from("ct_concierge_cases")
      .select("*")
      .eq("migration_id", data.migrationId)
      .maybeSingle();
    if (!row) return { case: null, exceptions: [] as ReturnType<typeof shapeException>[] };

    const { data: exceptions } = await supabase
      .from("ct_concierge_exceptions")
      .select("*")
      .eq("case_id", (row as any).id)
      .order("created_at");

    const who = await peopleByIds(context, [
      (row as any).assigned_to,
      ...((exceptions ?? []) as any[]).map((e) => e.raised_by),
    ]);

    return {
      case: shapeCase(row, who),
      exceptions: ((exceptions ?? []) as any[]).map((e) => shapeException(e, who)),
    };
  });

export const answerConciergeException = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ exceptionId: z.string().uuid(), response: z.string().trim().min(1).max(2000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("ct_concierge_exceptions")
      .select("id, company_id, case_id, question")
      .eq("id", data.exceptionId)
      .maybeSingle();
    if (!row) throw new Error("That question could not be found.");
    await assertFounder(context, row.company_id as string);

    const { error } = await supabase
      .from("ct_concierge_exceptions")
      .update({
        founder_response: data.response,
        status: "answered",
        responded_by: userId,
        responded_at: new Date().toISOString(),
      })
      .eq("id", data.exceptionId);
    if (error) throw new Error(error.message);

    await recordEvent(context, {
      companyId: row.company_id as string,
      action: "migration.concierge_question_answered",
      entityId: row.case_id as string,
      reason: row.question as string,
    });
    return { ok: true };
  });

export const submitFounderReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        caseId: z.string().uuid(),
        decision: z.enum(["approved", "changes_requested"]),
        note: z.string().trim().max(2000).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const row = await loadCase(context, data.caseId);
    await assertFounder(context, row.company_id as string);
    if (row.stage !== "founder_review") {
      throw new Error("This batch is not waiting for your review yet.");
    }
    if (data.decision === "changes_requested" && !data.note) {
      throw new Error("Please tell us what needs changing.");
    }

    const { error } = await supabase
      .from("ct_concierge_cases")
      .update({
        review_status: data.decision,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        review_note: data.note || null,
        stage: data.decision === "approved" ? "founder_review" : "preparing",
      })
      .eq("id", data.caseId);
    if (error) throw new Error(error.message);

    await recordEvent(context, {
      companyId: row.company_id as string,
      action:
        data.decision === "approved"
          ? "migration.concierge_approved_by_founder"
          : "migration.concierge_changes_requested",
      entityId: data.caseId,
      reason: data.note || null,
    });
    return { ok: true };
  });

/* -------------------------------------------------------------- staff side */

export const getConciergeQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSpecialist(context);
    const { supabase, userId } = context;

    const { data: cases } = await supabase
      .from("ct_concierge_cases")
      .select("*")
      .order("created_at", { ascending: false });

    const list = (cases ?? []) as any[];
    const migrationIds = list.map((c) => c.migration_id);
    const companyIds = Array.from(new Set(list.map((c) => c.company_id)));

    const [{ data: migrations }, { data: companies }, { data: exceptions }] = await Promise.all([
      migrationIds.length
        ? supabase
            .from("ct_migrations")
            .select("id, file_name, detected_provider, source_provider, row_count, status")
            .in("id", migrationIds)
        : Promise.resolve({ data: [] as any[] } as any),
      companyIds.length
        ? supabase.from("ct_companies").select("id, name, is_demo").in("id", companyIds)
        : Promise.resolve({ data: [] as any[] } as any),
      list.length
        ? supabase
            .from("ct_concierge_exceptions")
            .select("case_id, status")
            .in(
              "case_id",
              list.map((c) => c.id),
            )
        : Promise.resolve({ data: [] as any[] } as any),
    ]);

    const migrationById = new Map(((migrations ?? []) as any[]).map((m) => [String(m.id), m]));
    const companyById = new Map(((companies ?? []) as any[]).map((c) => [String(c.id), c]));
    const who = await peopleByIds(context, list.map((c) => c.assigned_to));

    return {
      userId,
      cases: list.map((c) => {
        const mine = ((exceptions ?? []) as any[]).filter((e) => e.case_id === c.id);
        const migration = migrationById.get(String(c.migration_id));
        const company = companyById.get(String(c.company_id));
        return {
          ...shapeCase(c, who),
          companyName: (company?.name as string | null) ?? "Company",
          isDemo: Boolean(company?.is_demo),
          fileName: (migration?.file_name as string | null) ?? null,
          provider:
            (migration?.detected_provider as string | null) ??
            (migration?.source_provider as string | null) ??
            "Spreadsheet",
          rowCount: Number(migration?.row_count ?? 0),
          openQuestions: mine.filter((e) => e.status === "open").length,
          answeredQuestions: mine.filter((e) => e.status === "answered").length,
        };
      }),
    };
  });

export const getConciergeCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ caseId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSpecialist(context);
    const { supabase, userId } = context;
    const row = await loadCase(context, data.caseId);

    const [{ data: migration }, { data: rows }, { data: company }, { data: exceptions }, { data: notes }] =
      await Promise.all([
        supabase.from("ct_migrations").select("*").eq("id", row.migration_id).maybeSingle(),
        supabase
          .from("ct_migration_rows")
          .select("*")
          .eq("migration_id", row.migration_id)
          .order("row_number"),
        supabase.from("ct_companies").select("id, name, is_demo").eq("id", row.company_id).maybeSingle(),
        supabase.from("ct_concierge_exceptions").select("*").eq("case_id", data.caseId).order("created_at"),
        supabase
          .from("ct_concierge_notes")
          .select("*")
          .eq("case_id", data.caseId)
          .order("created_at", { ascending: false }),
      ]);

    const { data: stakeholders } = await supabase
      .from("ct_stakeholders")
      .select("id, name, email")
      .eq("company_id", row.company_id);

    const who = await peopleByIds(context, [
      row.assigned_to,
      ...((exceptions ?? []) as any[]).map((e) => e.raised_by),
      ...((notes ?? []) as any[]).map((n) => n.author_id),
    ]);

    const lines = (rows ?? []) as any[];

    return {
      userId,
      case: shapeCase(row, who),
      company: {
        id: (company?.id as string) ?? row.company_id,
        name: (company?.name as string | null) ?? "Company",
        isDemo: Boolean(company?.is_demo),
      },
      migration: {
        id: row.migration_id as string,
        fileName: (migration?.file_name as string | null) ?? null,
        provider:
          (migration?.detected_provider as string | null) ??
          (migration?.source_provider as string | null) ??
          "Spreadsheet",
        status: (migration?.status as string) ?? "mapped",
        headers: (migration?.headers ?? []) as string[],
        mapping: (migration?.mapping ?? {}) as Record<string, string | null>,
      },
      stakeholders: ((stakeholders ?? []) as any[]).map((s) => ({
        id: s.id as string,
        name: s.name as string,
        email: (s.email as string | null) ?? null,
      })),
      rows: lines.map((r) => ({
        id: r.id as string,
        rowNumber: Number(r.row_number ?? 0),
        raw: (r.raw ?? {}) as Record<string, string | null>,
        mapped: (r.mapped ?? {}) as Record<string, string | number | null>,
        issues: (r.issues ?? []) as string[],
        matchStakeholderId: (r.match_stakeholder_id as string | null) ?? null,
        status: r.status as string,
      })),
      counts: {
        total: lines.length,
        ready: lines.filter((r) => r.status === "ready").length,
        error: lines.filter((r) => r.status === "error").length,
        skipped: lines.filter((r) => r.status === "skipped").length,
        imported: lines.filter((r) => r.status === "imported").length,
        matched: lines.filter((r) => r.match_stakeholder_id).length,
        shares: lines
          .filter((r) => r.status === "ready" || r.status === "imported")
          .reduce((sum, r) => sum + (Number((r.mapped ?? {}).quantity) || 0), 0),
      },
      exceptions: ((exceptions ?? []) as any[]).map((e) => shapeException(e, who)),
      notes: ((notes ?? []) as any[]).map((n) => ({
        id: n.id as string,
        body: n.body as string,
        author: n.author_id ? (who.get(String(n.author_id))?.name ?? "Harmonious") : "Harmonious",
        createdAt: n.created_at as string,
      })),
    };
  });

export const assignConciergeCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        caseId: z.string().uuid(),
        assignToMe: z.boolean().optional(),
        unassign: z.boolean().optional(),
        targetDate: z.string().trim().max(10).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSpecialist(context);
    const { supabase, userId } = context;
    const row = await loadCase(context, data.caseId);

    const patch: Record<string, string | null> = {};
    if (data.assignToMe) {
      patch['assigned_to'] = userId;
      patch['assigned_at'] = new Date().toISOString();
      if (row.stage === "received") patch['stage'] = "assigned";
    }
    if (data.unassign) {
      patch['assigned_to'] = null;
      patch['assigned_at'] = null;
      if (row.stage === "assigned") patch['stage'] = "received";
    }
    if (data.targetDate !== undefined) patch['target_date'] = data.targetDate || null;
    if (!Object.keys(patch).length) return { ok: true };

    const { error } = await supabase.from("ct_concierge_cases").update(patch).eq("id", data.caseId);
    if (error) throw new Error(error.message);

    await recordEvent(context, {
      companyId: row.company_id as string,
      action: data.unassign ? "migration.concierge_unassigned" : "migration.concierge_assigned",
      entityId: data.caseId,
      next: patch,
    });

    if (data.assignToMe) {
      const who = await peopleByIds(context, [userId]);
      await notifyFounder(context, row.company_id as string, {
        headline: "We have picked up your cap table migration",
        intro: `${who.get(String(userId))?.name ?? "A Harmonious specialist"} is now preparing your cap table file. We will come back to you with any questions, and you will approve the result before anything is recorded.`,
        eventKey: `cap-concierge-assigned:${data.caseId}`,
      });
    }
    return { ok: true };
  });

export const setConciergeStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ caseId: z.string().uuid(), stage: stageEnum }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSpecialist(context);
    const { supabase } = context;
    const row = await loadCase(context, data.caseId);
    if (row.stage === "recorded") throw new Error("This case has already been recorded.");
    if (data.stage === "recorded") throw new Error("A case is only recorded by accepting the batch.");

    const { error } = await supabase
      .from("ct_concierge_cases")
      .update({ stage: data.stage })
      .eq("id", data.caseId);
    if (error) throw new Error(error.message);

    await recordEvent(context, {
      companyId: row.company_id as string,
      action: "migration.concierge_stage",
      entityId: data.caseId,
      next: { stage: data.stage },
    });
    return { ok: true };
  });

export const raiseConciergeException = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        caseId: z.string().uuid(),
        question: z.string().trim().min(1).max(500),
        detail: z.string().trim().max(2000).optional().nullable(),
        migrationRowId: z.string().uuid().optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSpecialist(context);
    const { supabase, userId } = context;
    const row = await loadCase(context, data.caseId);

    const { error } = await supabase.from("ct_concierge_exceptions").insert({
      case_id: data.caseId,
      company_id: row.company_id,
      migration_row_id: data.migrationRowId || null,
      question: data.question,
      detail: data.detail || null,
      raised_by: userId,
    });
    if (error) throw new Error(error.message);

    if (row.stage !== "awaiting_founder") {
      await supabase
        .from("ct_concierge_cases")
        .update({ stage: "awaiting_founder" })
        .eq("id", data.caseId);
    }

    await recordEvent(context, {
      companyId: row.company_id as string,
      action: "migration.concierge_question_raised",
      entityId: data.caseId,
      reason: data.question,
    });

    await notifyFounder(context, row.company_id as string, {
      headline: "We have a question about your cap table migration",
      intro: "We need one thing confirmed before we can finish preparing your cap table.",
      details: [{ label: "Question", value: data.question }],
      eventKey: `cap-concierge-question:${data.caseId}:${Date.now()}`,
    });
    return { ok: true };
  });

export const resolveConciergeException = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ exceptionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSpecialist(context);
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("ct_concierge_exceptions")
      .select("id, case_id, company_id, question")
      .eq("id", data.exceptionId)
      .maybeSingle();
    if (!row) throw new Error("That question could not be found.");

    const { error } = await supabase
      .from("ct_concierge_exceptions")
      .update({ status: "resolved", resolved_by: userId, resolved_at: new Date().toISOString() })
      .eq("id", data.exceptionId);
    if (error) throw new Error(error.message);

    const { data: open } = await supabase
      .from("ct_concierge_exceptions")
      .select("id")
      .eq("case_id", row.case_id)
      .neq("status", "resolved");
    if (!((open ?? []) as any[]).length) {
      await supabase
        .from("ct_concierge_cases")
        .update({ stage: "preparing" })
        .eq("id", row.case_id)
        .eq("stage", "awaiting_founder");
    }

    await recordEvent(context, {
      companyId: row.company_id as string,
      action: "migration.concierge_question_resolved",
      entityId: row.case_id as string,
      reason: row.question as string,
    });
    return { ok: true };
  });

export const addConciergeNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ caseId: z.string().uuid(), body: z.string().trim().min(1).max(4000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSpecialist(context);
    const { supabase, userId } = context;
    await loadCase(context, data.caseId);
    const { error } = await supabase
      .from("ct_concierge_notes")
      .insert({ case_id: data.caseId, author_id: userId, body: data.body });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendForFounderReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ caseId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSpecialist(context);
    const { supabase } = context;
    const row = await loadCase(context, data.caseId);

    const { data: open } = await supabase
      .from("ct_concierge_exceptions")
      .select("id")
      .eq("case_id", data.caseId)
      .eq("status", "open");
    if (((open ?? []) as any[]).length) {
      throw new Error("Close out the open questions before sending this for founder review.");
    }

    const { data: rows } = await supabase
      .from("ct_migration_rows")
      .select("status, mapped, match_stakeholder_id")
      .eq("migration_id", row.migration_id);
    const lines = (rows ?? []) as any[];
    const ready = lines.filter((r) => r.status === "ready");
    if (!ready.length) throw new Error("There are no ready lines to put in front of the founder.");

    const summary = {
      lines: ready.length,
      shares: ready.reduce((sum, r) => sum + (Number((r.mapped ?? {}).quantity) || 0), 0),
      matched: ready.filter((r) => r.match_stakeholder_id).length,
      newHolders: new Set(
        ready
          .filter((r) => !r.match_stakeholder_id && (r.mapped ?? {}).holderName)
          .map((r) => String((r.mapped ?? {}).holderName).toLowerCase()),
      ).size,
      needsAttention: lines.filter((r) => r.status === "error").length,
      skipped: lines.filter((r) => r.status === "skipped").length,
    };

    const { error } = await supabase
      .from("ct_concierge_cases")
      .update({
        stage: "founder_review",
        review_status: "pending",
        review_note: null,
        reviewed_at: null,
        reviewed_by: null,
        sent_for_review_at: new Date().toISOString(),
        prepared_summary: summary as any,
      })
      .eq("id", data.caseId);
    if (error) throw new Error(error.message);

    await recordEvent(context, {
      companyId: row.company_id as string,
      action: "migration.concierge_sent_for_review",
      entityId: data.caseId,
      next: summary,
    });

    await notifyFounder(context, row.company_id as string, {
      headline: "Your cap table is ready for review",
      intro:
        "We have finished preparing your cap table. Please review it in the portal — nothing is recorded until you approve it.",
      details: [
        { label: "Lines prepared", value: String(summary.lines) },
        { label: "Shares", value: summary.shares.toLocaleString("en-US") },
        { label: "New shareholders", value: String(summary.newHolders) },
      ],
      eventKey: `cap-concierge-review:${data.caseId}:${row.migration_id}`,
    });
    return { ok: true, summary };
  });
