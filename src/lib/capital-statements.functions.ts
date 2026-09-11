// Capital account statements: what each investor holds in the fund at closing.
// Harmonious produces these as a record of the fund's own books — they are not
// a valuation, audit, tax return or investment advice.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function canManage(supabase: any, offeringId: string) {
  const { data } = await supabase.rpc("can_manage_diligence", { _offering_id: offeringId });
  return Boolean(data);
}

async function audit(
  supabase: any,
  opts: {
    actorId: string;
    offeringId: string;
    applicationId?: string | null;
    summary: string;
    metadata?: Record<string, unknown>;
  },
) {
  try {
    const activity = await import("@/lib/reviewer-activity.server");
    await activity.logReviewerActivity(supabase, {
      actorId: opts.actorId,
      applicationId: opts.applicationId ?? null,
      offeringId: opts.offeringId,
      action: "capital_statement_generated",
      area: "reporting",
      outcome: "completed",
      summary: opts.summary,
      note: null,
      metadata: opts.metadata ?? {},
    });
  } catch {
    /* the record of the statement itself is what matters */
  }
}

/** Produces (or replaces) the statement for one closed investor. */
export const generateStatementForApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ application_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: app } = await supabase
      .from("investor_applications")
      .select("id, offering_id")
      .eq("id", data.application_id)
      .maybeSingle();
    if (!app) throw new Error("That investor was not found.");
    if (!(await canManage(supabase, app.offering_id))) {
      throw new Error("You do not have permission to produce statements for this fund.");
    }

    const helper = await import("@/lib/capital-statements.server");
    await helper.assertStatementsInScope(supabase, app.offering_id as string);

    const row = await helper.generateStatement(supabase, data.application_id, userId);
    if (!row) throw new Error("Confirm the closing first, then produce the statement.");

    await audit(supabase, {
      actorId: userId,
      offeringId: app.offering_id as string,
      applicationId: data.application_id,
      summary: `Capital account statement v${row.version} produced`,
      metadata: { statement_id: row.id, version: row.version },
    });

    return { ok: true, statement: row };
  });

/** Produces statements for every closed investor in a fund. */
export const generateStatementsForFund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ offering_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await canManage(supabase, data.offering_id))) {
      throw new Error("You do not have permission to produce statements for this fund.");
    }

    const helper = await import("@/lib/capital-statements.server");
    await helper.assertStatementsInScope(supabase, data.offering_id);

    const { data: closings } = await supabase
      .from("application_closings")
      .select("application_id")
      .eq("offering_id", data.offering_id);

    let produced = 0;
    const skipped: string[] = [];
    for (const c of ((closings ?? []) as any[])) {
      try {
        const row = await helper.generateStatement(supabase, c.application_id as string, userId);
        if (row) produced += 1;
        else skipped.push(c.application_id as string);
      } catch {
        skipped.push(c.application_id as string);
      }
    }

    await audit(supabase, {
      actorId: userId,
      offeringId: data.offering_id,
      summary: `Capital account statements produced for ${produced} investor${produced === 1 ? "" : "s"}`,
      metadata: { produced, skipped: skipped.length },
    });

    return { produced, skipped: skipped.length };
  });

/** Current statement for each closed investor on the staff closing desk. */
export const listStatementSummaries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("capital_account_statements")
      .select("id, application_id, offering_id, statement_date, version, generated_at, snapshot")
      .eq("superseded", false);
    if (error) return { rows: [] as any[] };
    return { rows: (data ?? []) as any[] };
  });

/** Every statement Harmonious has produced for one investor, newest first. */
export const listStatementsForApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ application_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("capital_account_statements")
      .select("id, statement_date, version, superseded, generated_at, snapshot")
      .eq("application_id", data.application_id)
      .order("version", { ascending: false });
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as any[] };
  });

/** The signed-in investor's own statements. */
export const getMyStatements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: apps } = await supabase
      .from("investor_applications")
      .select("id")
      .eq("user_id", userId);
    const ids = ((apps ?? []) as any[]).map((a) => a.id as string);
    if (ids.length === 0) return { rows: [] as any[] };

    const { data: rows } = await supabase
      .from("capital_account_statements")
      .select("id, application_id, statement_date, version, superseded, generated_at, snapshot")
      .in("application_id", ids)
      .eq("superseded", false)
      .order("statement_date", { ascending: false });
    return { rows: (rows ?? []) as any[] };
  });
