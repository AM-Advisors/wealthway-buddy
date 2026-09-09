import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const QUESTION_STATUSES = ["assigned", "answered", "accepted", "needs_followup"] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

export function questionStatusLabel(status: string) {
  switch (status) {
    case "answered":
      return "Answered";
    case "accepted":
      return "Accepted";
    case "needs_followup":
      return "Needs follow-up";
    default:
      return "Waiting on investor";
  }
}

async function canManage(supabase: any, offeringId: string) {
  const { data } = await supabase.rpc("can_manage_diligence", { _offering_id: offeringId });
  return Boolean(data);
}

async function identity(supabase: any, userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("legal_name, email")
    .eq("user_id", userId)
    .maybeSingle();
  return { name: data?.legal_name ?? null, email: data?.email ?? null };
}

async function log(
  supabase: any,
  userId: string,
  offeringId: string,
  eventType: string,
  summary: string,
  metadata: Record<string, unknown> = {},
) {
  try {
    const who = await identity(supabase, userId);
    const { data: room } = await supabase
      .from("diligence_rooms")
      .select("id")
      .eq("offering_id", offeringId)
      .maybeSingle();
    await supabase.from("diligence_activity").insert({
      room_id: room?.id ?? null,
      offering_id: offeringId,
      actor_id: userId,
      actor_name: who.name,
      actor_email: who.email,
      event_type: eventType,
      summary,
      metadata,
    });
  } catch {
    /* activity logging never blocks the action */
  }
}

const offeringInput = (data: unknown) => z.object({ offering_id: z.string().uuid() }).parse(data);

/* ------------------------------------------------------------------ */
/* Manager view: the question list, who has it, and every answer       */
/* ------------------------------------------------------------------ */

export const getQuestionBoard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(offeringInput)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (!(await canManage(supabase, data.offering_id))) {
      throw new Error("You do not have access to this fund's questions.");
    }

    const [{ data: questions }, { data: assignments }, { data: responses }] = await Promise.all([
      supabase
        .from("diligence_request_questions")
        .select("*")
        .eq("offering_id", data.offering_id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("diligence_question_assignments")
        .select("*")
        .eq("offering_id", data.offering_id)
        .order("created_at", { ascending: true }),
      supabase
        .from("diligence_question_responses")
        .select("*")
        .eq("offering_id", data.offering_id)
        .order("created_at", { ascending: true }),
    ]);

    const rows = (assignments ?? []) as any[];
    const answerRows = (responses ?? []) as any[];

    // People who could be assigned a question on this fund.
    const [{ data: access }, { data: apps }] = await Promise.all([
      supabase.from("investor_fund_access").select("user_id").eq("offering_id", data.offering_id),
      supabase
        .from("investor_applications")
        .select("user_id")
        .eq("offering_id", data.offering_id),
    ]);
    const peopleIds = new Set<string>([
      ...((access ?? []) as any[]).map((r) => r.user_id),
      ...((apps ?? []) as any[]).map((r) => r.user_id),
      ...rows.map((r) => r.investor_user_id),
    ]);
    let profiles: any[] = [];
    if (peopleIds.size) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, legal_name, email")
        .in("user_id", [...peopleIds]);
      profiles = (profs ?? []) as any[];
    }
    const nameOf = (id: string) => {
      const p = profiles.find((x) => x.user_id === id);
      return { name: p?.legal_name ?? null, email: p?.email ?? null };
    };

    const board = ((questions ?? []) as any[]).map((q) => {
      const mine = rows.filter((a) => a.question_id === q.id);
      return {
        ...q,
        assignments: mine.map((a) => ({
          ...a,
          investor: nameOf(a.investor_user_id),
          answers: answerRows
            .filter((r) => r.assignment_id === a.id)
            .map((r) => ({
              id: r.id,
              body: r.body,
              from_reviewer: r.from_reviewer,
              author_name: r.author_name,
              created_at: r.created_at,
            })),
        })),
        assignedCount: mine.length,
        answeredCount: mine.filter((a) => a.status !== "assigned").length,
      };
    });

    return {
      questions: board,
      people: [...peopleIds]
        .map((id) => ({ user_id: id, ...nameOf(id) }))
        .sort((a, b) => (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? "")),
      totals: {
        questions: board.length,
        assigned: rows.length,
        waiting: rows.filter((a) => a.status === "assigned").length,
        answered: rows.filter((a) => a.status === "answered").length,
        accepted: rows.filter((a) => a.status === "accepted").length,
        followUp: rows.filter((a) => a.status === "needs_followup").length,
      },
    };
  });

/* ------------------------------------------------------------------ */
/* Scoreboard: who answered what, with a score and the outstanding list */
/* ------------------------------------------------------------------ */

export const getQuestionScoreboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(offeringInput)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (!(await canManage(supabase, data.offering_id))) {
      throw new Error("You do not have access to this fund's questions.");
    }

    const [{ data: questions }, { data: assignments }, { data: responses }] = await Promise.all([
      supabase
        .from("diligence_request_questions")
        .select("id, prompt, category, is_required, sort_order, created_at")
        .eq("offering_id", data.offering_id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("diligence_question_assignments")
        .select("*")
        .eq("offering_id", data.offering_id),
      supabase
        .from("diligence_question_responses")
        .select("assignment_id, from_reviewer, created_at")
        .eq("offering_id", data.offering_id)
        .order("created_at", { ascending: true }),
    ]);

    const qRows = (questions ?? []) as any[];
    const aRows = (assignments ?? []) as any[];
    const rRows = (responses ?? []) as any[];

    const ids = [...new Set(aRows.map((a) => a.investor_user_id))];
    let profiles: any[] = [];
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, legal_name, email")
        .in("user_id", ids);
      profiles = (profs ?? []) as any[];
    }
    const who = (id: string) => {
      const p = profiles.find((x) => x.user_id === id);
      return { name: p?.legal_name ?? null, email: p?.email ?? null };
    };

    const answersFor = (assignmentId: string) =>
      rRows.filter((r) => r.assignment_id === assignmentId && !r.from_reviewer);

    const today = new Date().toISOString().slice(0, 10);
    const promptOf = new Map(qRows.map((q) => [q.id, q]));

    const people = ids
      .map((id) => {
        const mine = aRows.filter((a) => a.investor_user_id === id);
        const accepted = mine.filter((a) => a.status === "accepted");
        const answered = mine.filter((a) => a.status === "answered");
        const followUp = mine.filter((a) => a.status === "needs_followup");
        const waiting = mine.filter((a) => a.status === "assigned");
        const points = accepted.length + answered.length * 0.5;
        const score = mine.length ? Math.round((points / mine.length) * 100) : 0;

        const outstanding = [...waiting, ...followUp].map((a) => ({
          assignment_id: a.id,
          question_id: a.question_id,
          prompt: promptOf.get(a.question_id)?.prompt ?? "Question",
          category: promptOf.get(a.question_id)?.category ?? "general",
          status: a.status as string,
          due_date: a.due_date as string | null,
          overdue: Boolean(a.due_date && a.due_date < today && a.status !== "accepted"),
        }));

        const trail = mine
          .flatMap((a) =>
            answersFor(a.id).map((r) => ({
              at: r.created_at as string,
              prompt: promptOf.get(a.question_id)?.prompt ?? "Question",
              status: a.status as string,
            })),
          )
          .sort((x, y) => (x.at < y.at ? 1 : -1))
          .slice(0, 25);

        const lastAnswerAt = trail[0]?.at ?? null;

        return {
          user_id: id,
          ...who(id),
          assigned: mine.length,
          accepted: accepted.length,
          answered: answered.length,
          followUp: followUp.length,
          waiting: waiting.length,
          outstandingCount: outstanding.length,
          overdueCount: outstanding.filter((o) => o.overdue).length,
          score,
          lastAnswerAt,
          outstanding,
          trail,
        };
      })
      .sort((a, b) => a.score - b.score || (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? ""));

    const questionRows = qRows.map((q) => {
      const mine = aRows.filter((a) => a.question_id === q.id);
      const done = mine.filter((a) => a.status === "accepted" || a.status === "answered").length;
      return {
        id: q.id,
        prompt: q.prompt,
        category: q.category,
        is_required: q.is_required,
        assigned: mine.length,
        answered: done,
        unanswered: mine.length - done,
        completion: mine.length ? Math.round((done / mine.length) * 100) : 0,
      };
    });

    const totalAssigned = aRows.length;
    const totalPoints =
      aRows.filter((a) => a.status === "accepted").length +
      aRows.filter((a) => a.status === "answered").length * 0.5;

    return {
      people,
      questions: questionRows,
      totals: {
        people: people.length,
        assigned: totalAssigned,
        outstanding: aRows.filter((a) => a.status === "assigned" || a.status === "needs_followup")
          .length,
        overdue: aRows.filter(
          (a) => a.due_date && a.due_date < today && a.status !== "accepted",
        ).length,
        score: totalAssigned ? Math.round((totalPoints / totalAssigned) * 100) : 0,
      },
    };
  });

export const saveQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        offering_id: z.string().uuid(),
        id: z.string().uuid().optional(),
        prompt: z.string().trim().min(3).max(1000),
        guidance: z.string().trim().max(2000).optional(),
        category: z.string().trim().min(1).max(60).default("general"),
        is_required: z.boolean().default(true),
        sort_order: z.number().int().min(0).max(999).default(0),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await canManage(supabase, data.offering_id))) throw new Error("Not allowed.");

    const payload = {
      offering_id: data.offering_id,
      prompt: data.prompt,
      guidance: data.guidance ?? null,
      category: data.category,
      is_required: data.is_required,
      sort_order: data.sort_order,
    };

    if (data.id) {
      const { error } = await supabase
        .from("diligence_request_questions")
        .update(payload)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      await log(supabase, userId, data.offering_id, "question_updated", `Edited a question: ${data.prompt}`);
      return { id: data.id };
    }

    const { data: room } = await supabase
      .from("diligence_rooms")
      .select("id")
      .eq("offering_id", data.offering_id)
      .maybeSingle();

    const { data: created, error } = await supabase
      .from("diligence_request_questions")
      .insert({ ...payload, room_id: room?.id ?? null, created_by: userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await log(supabase, userId, data.offering_id, "question_added", `Added a question: ${data.prompt}`);
    return { id: created.id as string };
  });

export const removeQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ offering_id: z.string().uuid(), id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await canManage(supabase, data.offering_id))) throw new Error("Not allowed.");
    const { error } = await supabase.from("diligence_request_questions").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await log(supabase, userId, data.offering_id, "question_removed", "Removed a question");
    return { ok: true };
  });

export const assignQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        offering_id: z.string().uuid(),
        question_id: z.string().uuid(),
        investor_user_ids: z.array(z.string().uuid()).min(1).max(50),
        due_date: z.string().trim().min(1).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await canManage(supabase, data.offering_id))) throw new Error("Not allowed.");

    const rows = data.investor_user_ids.map((id) => ({
      question_id: data.question_id,
      offering_id: data.offering_id,
      investor_user_id: id,
      assigned_by: userId,
      due_date: data.due_date ?? null,
      status: "assigned",
    }));
    const { error } = await supabase
      .from("diligence_question_assignments")
      .upsert(rows, { onConflict: "question_id,investor_user_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);

    await log(
      supabase,
      userId,
      data.offering_id,
      "question_assigned",
      `Sent a question to ${rows.length} ${rows.length === 1 ? "person" : "people"}`,
      { question_id: data.question_id },
    );
    return { assigned: rows.length };
  });

export const unassignQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ offering_id: z.string().uuid(), assignment_id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (!(await canManage(supabase, data.offering_id))) throw new Error("Not allowed.");
    const { error } = await supabase
      .from("diligence_question_assignments")
      .delete()
      .eq("id", data.assignment_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setQuestionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        offering_id: z.string().uuid(),
        assignment_id: z.string().uuid(),
        status: z.enum(QUESTION_STATUSES),
        note: z.string().trim().max(4000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await canManage(supabase, data.offering_id))) throw new Error("Not allowed.");

    const { data: assignment } = await supabase
      .from("diligence_question_assignments")
      .select("id, question_id")
      .eq("id", data.assignment_id)
      .maybeSingle();
    if (!assignment) throw new Error("That question is no longer assigned.");

    const { error } = await supabase
      .from("diligence_question_assignments")
      .update({
        status: data.status,
        reviewed_at: new Date().toISOString(),
        reviewed_by: userId,
      })
      .eq("id", data.assignment_id);
    if (error) throw new Error(error.message);

    if (data.note) {
      const who = await identity(supabase, userId);
      await supabase.from("diligence_question_responses").insert({
        assignment_id: data.assignment_id,
        question_id: assignment.question_id,
        offering_id: data.offering_id,
        author_id: userId,
        author_name: who.name,
        from_reviewer: true,
        body: data.note,
      });
    }

    await log(
      supabase,
      userId,
      data.offering_id,
      "question_reviewed",
      `Marked an answer as ${questionStatusLabel(data.status).toLowerCase()}`,
    );
    return { ok: true };
  });

export const replyToAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        offering_id: z.string().uuid(),
        assignment_id: z.string().uuid(),
        body: z.string().trim().min(1).max(4000),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await canManage(supabase, data.offering_id))) throw new Error("Not allowed.");
    const { data: assignment } = await supabase
      .from("diligence_question_assignments")
      .select("id, question_id")
      .eq("id", data.assignment_id)
      .maybeSingle();
    if (!assignment) throw new Error("That question is no longer assigned.");
    const who = await identity(supabase, userId);
    const { error } = await supabase.from("diligence_question_responses").insert({
      assignment_id: data.assignment_id,
      question_id: assignment.question_id,
      offering_id: data.offering_id,
      author_id: userId,
      author_name: who.name,
      from_reviewer: true,
      body: data.body,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Investor view: my questions and my answers                          */
/* ------------------------------------------------------------------ */

export const getMyQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(offeringInput)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: assignments } = await supabase
      .from("diligence_question_assignments")
      .select("*")
      .eq("offering_id", data.offering_id)
      .eq("investor_user_id", userId)
      .order("created_at", { ascending: true });

    const rows = (assignments ?? []) as any[];
    if (!rows.length) return { questions: [], waiting: 0 };

    const [{ data: questions }, { data: responses }] = await Promise.all([
      supabase
        .from("diligence_request_questions")
        .select("id, prompt, guidance, category, is_required, sort_order")
        .in("id", rows.map((r) => r.question_id)),
      supabase
        .from("diligence_question_responses")
        .select("*")
        .in("assignment_id", rows.map((r) => r.id))
        .order("created_at", { ascending: true }),
    ]);

    const qById = new Map(((questions ?? []) as any[]).map((q) => [q.id, q]));
    const answers = (responses ?? []) as any[];

    const list = rows
      .map((a) => ({
        assignment_id: a.id,
        status: a.status as string,
        due_date: a.due_date as string | null,
        answered_at: a.answered_at as string | null,
        question: qById.get(a.question_id) ?? null,
        answers: answers
          .filter((r) => r.assignment_id === a.id)
          .map((r) => ({
            id: r.id,
            body: r.body,
            from_reviewer: r.from_reviewer,
            author_name: r.author_name,
            created_at: r.created_at,
          })),
      }))
      .filter((r) => r.question)
      .sort((a, b) => (a.question?.sort_order ?? 0) - (b.question?.sort_order ?? 0));

    return {
      questions: list,
      waiting: list.filter((r) => r.status === "assigned" || r.status === "needs_followup").length,
    };
  });

export const answerQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        offering_id: z.string().uuid(),
        assignment_id: z.string().uuid(),
        body: z.string().trim().min(1).max(4000),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: assignment } = await supabase
      .from("diligence_question_assignments")
      .select("id, question_id, investor_user_id")
      .eq("id", data.assignment_id)
      .maybeSingle();
    if (!assignment || assignment.investor_user_id !== userId) {
      throw new Error("That question is not assigned to you.");
    }

    const who = await identity(supabase, userId);
    const { error } = await supabase.from("diligence_question_responses").insert({
      assignment_id: data.assignment_id,
      question_id: assignment.question_id,
      offering_id: data.offering_id,
      author_id: userId,
      author_name: who.name,
      from_reviewer: false,
      body: data.body,
    });
    if (error) throw new Error(error.message);

    await supabase
      .from("diligence_question_assignments")
      .update({ status: "answered", answered_at: new Date().toISOString() })
      .eq("id", data.assignment_id);

    await log(
      supabase,
      userId,
      data.offering_id,
      "question_answered",
      `${who.name ?? "An investor"} answered a diligence question`,
    );
    return { ok: true };
  });
