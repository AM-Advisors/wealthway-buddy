import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Bringing a fund that already exists elsewhere onto the platform.
 *  Records are staged first and only written into the live fund once
 *  a super admin confirms them. */

export const MIGRATION_STATUSES = [
  { value: "not_started", label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "records_loaded", label: "Records loaded" },
  { value: "balances_confirmed", label: "Balances confirmed" },
  { value: "complete", label: "Complete" },
] as const;

export const MIGRATION_STEPS = [
  { key: "prior_admin", label: "Prior administrator named and records-as-of date recorded" },
  { key: "investor_list", label: "Investor list received" },
  { key: "balances", label: "Commitments and funded amounts confirmed" },
  { key: "documents", label: "Signed subscription documents loaded" },
  { key: "banking", label: "Banking and wire details confirmed" },
  { key: "invitations", label: "Investor access invitations sent" },
] as const;

export type StepState = { done: boolean; by?: string; at?: string; note?: string };

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

type Who = { userId: string; roles: string[]; isStaff: boolean; isSuper: boolean; email: string };

async function whoIs(context: any): Promise<Who> {
  const { data } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  const roles = ((data ?? []) as any[]).map((r) => String(r.role));
  return {
    userId: context.userId,
    roles,
    isStaff: roles.some((r) => STAFF_ROLES.includes(r)),
    isSuper: roles.some((r) => r === "super_admin" || r === "admin"),
    email: (context.claims?.email as string | undefined) ?? "",
  };
}

async function requireSuper(context: any) {
  const who = await whoIs(context);
  if (!who.isSuper) {
    throw new Error("Forbidden: bringing a fund across is limited to super admins.");
  }
  return who;
}

async function requireStaff(context: any) {
  const who = await whoIs(context);
  if (!who.isStaff) throw new Error("Forbidden: this area is for the Harmonious team.");
  return who;
}

async function audit(
  context: any,
  who: Who,
  entry: { action: string; offeringId: string; target?: string | null; previous?: unknown; next?: unknown },
) {
  await context.supabase.from("contract_audit_events").insert({
    actor_id: who.userId,
    actor_role: who.roles.join(", ") || null,
    offering_id: entry.offeringId,
    area: "fund migration",
    action: entry.action,
    target: entry.target ?? null,
    previous_value: (entry.previous ?? null) as any,
    new_value: (entry.next ?? null) as any,
    source: "web",
  });
}

function normaliseRow(row: any) {
  const email = String(row.email ?? "").trim().toLowerCase();
  const name = String(row.full_name ?? "").trim();
  const errors: string[] = [];
  if (!name) errors.push("Name is missing.");
  if (!email) errors.push("Email address is missing.");
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Email address looks wrong.");
  if (Number(row.commitment_cents ?? 0) < 0) errors.push("Commitment cannot be negative.");
  if (Number(row.funded_cents ?? 0) < 0) errors.push("Funded amount cannot be negative.");
  return { email, name, errors };
}

/* ------------------------------------------------------------------ reads */

export const getFundMigration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ offeringId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const who = await requireStaff(context);

    const { data: offering } = await context.supabase
      .from("offerings")
      .select("id, name")
      .eq("id", data.offeringId)
      .maybeSingle();

    const { data: migration } = await context.supabase
      .from("fund_migrations")
      .select("*")
      .eq("offering_id", data.offeringId)
      .maybeSingle();

    let rows: any[] = [];
    if (migration) {
      const { data: staged } = await context.supabase
        .from("fund_migration_rows")
        .select("*")
        .eq("migration_id", (migration as any).id)
        .order("created_at", { ascending: true });
      rows = (staged ?? []) as any[];
    }

    return {
      canManage: who.isSuper,
      offering: offering ?? null,
      migration: migration ?? null,
      rows,
    };
  });

export const listFundMigrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStaff(context);
    const { data } = await context.supabase
      .from("fund_migrations")
      .select("*, offerings(name)")
      .order("updated_at", { ascending: false });
    return { migrations: (data ?? []) as any[] };
  });

/* ----------------------------------------------------------------- checklist */

export const saveFundMigration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        offeringId: z.string().uuid(),
        priorAdministrator: z.string().max(200).optional(),
        recordsAsOf: z.string().min(10).nullable().optional(),
        status: z.string().optional(),
        note: z.string().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await requireSuper(context);

    const { data: existing } = await context.supabase
      .from("fund_migrations")
      .select("*")
      .eq("offering_id", data.offeringId)
      .maybeSingle();

    const patch: any = {
      offering_id: data.offeringId,
      prior_administrator: data.priorAdministrator ?? (existing as any)?.prior_administrator ?? null,
      records_as_of:
        data.recordsAsOf === undefined ? ((existing as any)?.records_as_of ?? null) : data.recordsAsOf,
      status: data.status ?? (existing as any)?.status ?? "not_started",
      note: data.note ?? (existing as any)?.note ?? null,
    };

    if (existing) {
      const { error } = await context.supabase
        .from("fund_migrations")
        .update(patch)
        .eq("id", (existing as any).id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase
        .from("fund_migrations")
        .insert({ ...patch, created_by: who.userId, steps: {} });
      if (error) throw new Error(error.message);
    }

    await audit(context, who, {
      action: existing ? "migration updated" : "migration started",
      offeringId: data.offeringId,
      previous: existing ? { status: (existing as any).status } : null,
      next: { status: patch.status, prior_administrator: patch.prior_administrator },
    });

    return { ok: true };
  });

export const setMigrationStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        offeringId: z.string().uuid(),
        stepKey: z.string().min(1),
        done: z.boolean(),
        note: z.string().max(1000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await requireSuper(context);

    const { data: row } = await context.supabase
      .from("fund_migrations")
      .select("*")
      .eq("offering_id", data.offeringId)
      .maybeSingle();
    if (!row) throw new Error("Start the migration record first.");

    const steps = { ...(((row as any).steps ?? {}) as Record<string, StepState>) };
    steps[data.stepKey] = data.done
      ? { done: true, by: who.email || who.userId, at: new Date().toISOString(), note: data.note ?? "" }
      : { done: false, note: data.note ?? "" };

    const { error } = await context.supabase
      .from("fund_migrations")
      .update({ steps: steps as any })
      .eq("id", (row as any).id);
    if (error) throw new Error(error.message);

    await audit(context, who, {
      action: data.done ? "step completed" : "step reopened",
      offeringId: data.offeringId,
      target: data.stepKey,
      next: steps[data.stepKey] as any,
    });

    return { ok: true };
  });

/* -------------------------------------------------------------- staged rows */

const rowInput = z.object({
  id: z.string().uuid().optional(),
  full_name: z.string().max(200).default(""),
  email: z.string().max(200).default(""),
  investor_type: z.string().max(40).nullable().optional(),
  commitment_cents: z.number().int().min(0).default(0),
  funded_cents: z.number().int().min(0).default(0),
  units: z.number().nullable().optional(),
  closing_date: z.string().min(10).nullable().optional(),
  accreditation_status: z.string().max(40).nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
});

export const stageMigrationRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ offeringId: z.string().uuid(), rows: z.array(rowInput).min(1).max(2000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await requireSuper(context);

    let { data: migration } = await context.supabase
      .from("fund_migrations")
      .select("*")
      .eq("offering_id", data.offeringId)
      .maybeSingle();

    if (!migration) {
      const { data: created, error } = await context.supabase
        .from("fund_migrations")
        .insert({ offering_id: data.offeringId, created_by: who.userId, status: "in_progress" })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      migration = created;
    }

    const migrationId = (migration as any).id as string;

    const { data: existing } = await context.supabase
      .from("fund_migration_rows")
      .select("id, email")
      .eq("migration_id", migrationId);
    const seen = new Map<string, string>();
    for (const r of (existing ?? []) as any[]) seen.set(String(r.email).toLowerCase(), r.id);

    const inserts: any[] = [];
    for (const raw of data.rows) {
      const { email, name, errors } = normaliseRow(raw);
      if (email && seen.has(email)) errors.push("This email is already on this list.");
      if (email) seen.set(email, "staged");
      inserts.push({
        migration_id: migrationId,
        offering_id: data.offeringId,
        full_name: name,
        email,
        investor_type: raw.investor_type ?? null,
        commitment_cents: raw.commitment_cents ?? 0,
        funded_cents: raw.funded_cents ?? 0,
        units: raw.units ?? null,
        closing_date: raw.closing_date ?? null,
        accreditation_status: raw.accreditation_status ?? null,
        note: raw.note ?? null,
        row_status: errors.length ? "error" : "pending",
        error_text: errors.length ? errors.join(" ") : null,
      });
    }

    const { error } = await context.supabase.from("fund_migration_rows").insert(inserts);
    if (error) throw new Error(error.message);

    await audit(context, who, {
      action: "records staged",
      offeringId: data.offeringId,
      next: { count: inserts.length },
    });

    return { staged: inserts.length, withErrors: inserts.filter((r) => r.row_status === "error").length };
  });

export const saveMigrationRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => rowInput.extend({ offeringId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const who = await requireSuper(context);
    const { email, name, errors } = normaliseRow(data);

    const patch = {
      full_name: name,
      email,
      investor_type: data.investor_type ?? null,
      commitment_cents: data.commitment_cents ?? 0,
      funded_cents: data.funded_cents ?? 0,
      units: data.units ?? null,
      closing_date: data.closing_date ?? null,
      accreditation_status: data.accreditation_status ?? null,
      note: data.note ?? null,
      row_status: errors.length ? "error" : "pending",
      error_text: errors.length ? errors.join(" ") : null,
    };

    if (data.id) {
      const { data: current } = await context.supabase
        .from("fund_migration_rows")
        .select("row_status")
        .eq("id", data.id)
        .maybeSingle();
      if ((current as any)?.row_status === "imported") {
        throw new Error("This record has already been brought across and can no longer change.");
      }
      const { error } = await context.supabase
        .from("fund_migration_rows")
        .update(patch)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { data: migration } = await context.supabase
        .from("fund_migrations")
        .select("id")
        .eq("offering_id", data.offeringId)
        .maybeSingle();
      if (!migration) throw new Error("Start the migration record first.");
      const { error } = await context.supabase.from("fund_migration_rows").insert({
        ...patch,
        migration_id: (migration as any).id,
        offering_id: data.offeringId,
      });
      if (error) throw new Error(error.message);
    }

    await audit(context, who, {
      action: data.id ? "record edited" : "record added",
      offeringId: data.offeringId,
      target: email,
    });

    return { ok: true, errors };
  });

export const deleteMigrationRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireSuper(context);
    const { data: row } = await context.supabase
      .from("fund_migration_rows")
      .select("row_status")
      .eq("id", data.id)
      .maybeSingle();
    if ((row as any)?.row_status === "imported") {
      throw new Error("This record is already on the fund and cannot be removed here.");
    }
    const { error } = await context.supabase.from("fund_migration_rows").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------------------ import */

async function ensureAccount(supabaseAdmin: any, email: string, name: string) {
  let targetUserId: string | null = null;
  const { data: profileRow } = await supabaseAdmin
    .from("profiles")
    .select("user_id")
    .ilike("email", email)
    .maybeSingle();
  if (profileRow) targetUserId = (profileRow as any).user_id as string;

  if (!targetUserId) {
    const { data: listed } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const match = (listed?.users ?? []).find((u: any) => (u.email ?? "").toLowerCase() === email);
    if (match) targetUserId = match.id as string;
  }

  if (!targetUserId) {
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: name ? { legal_name: name } : {},
    });
    if (error || !created?.user) throw new Error(error?.message ?? "Could not create that account.");
    targetUserId = created.user.id as string;
  }

  const { data: existingProfile } = await supabaseAdmin
    .from("profiles")
    .select("id, legal_name")
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (existingProfile) {
    await supabaseAdmin
      .from("profiles")
      .update({ email, legal_name: name || (existingProfile as any).legal_name || null })
      .eq("id", (existingProfile as any).id);
  } else {
    await supabaseAdmin.from("profiles").insert({ user_id: targetUserId, email, legal_name: name || null });
  }

  return targetUserId as string;
}

export const importMigrationRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ offeringId: z.string().uuid(), rowIds: z.array(z.string().uuid()).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await requireSuper(context);

    const { data: migration } = await context.supabase
      .from("fund_migrations")
      .select("*")
      .eq("offering_id", data.offeringId)
      .maybeSingle();
    if (!migration) throw new Error("Start the migration record first.");

    let query = context.supabase
      .from("fund_migration_rows")
      .select("*")
      .eq("migration_id", (migration as any).id)
      .neq("row_status", "imported");
    if (data.rowIds?.length) query = query.in("id", data.rowIds);
    const { data: rows } = await query;

    // Rows flagged earlier are retried when the record itself is now valid, so a
    // failed run can simply be run again once the cause is cleared.
    const pending = ((rows ?? []) as any[]).filter(
      (r) => r.row_status !== "error" || normaliseRow(r).errors.length === 0,
    );
    if (!pending.length) {
      throw new Error("There is nothing ready to bring across. Fix the flagged records first.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let imported = 0;
    let failed = 0;

    for (const row of pending) {
      try {
        const email = String(row.email).toLowerCase();
        const userId = await ensureAccount(supabaseAdmin, email, row.full_name || "");

        const { data: existingApp } = await supabaseAdmin
          .from("investor_applications")
          .select("id")
          .eq("user_id", userId)
          .eq("offering_id", data.offeringId)
          .maybeSingle();

        let applicationId = (existingApp as any)?.id as string | undefined;

        if (!applicationId) {
          const funded = Number(row.funded_cents ?? 0);
          const commitment = Number(row.commitment_cents ?? 0);
          const { data: created, error } = await supabaseAdmin
            .from("investor_applications")
            .insert({
              user_id: userId,
              offering_id: data.offeringId,
              status: "migrated",
              current_step: "complete",
              source: "migration",
              commitment_cents: commitment,
              funding_status: funded > 0 && funded >= commitment ? "settled" : funded > 0 ? "processing" : "not_started",
              accreditation_status: row.accreditation_status === "approved" ? "approved" : "not_started",
              submitted_at: row.closing_date ? new Date(row.closing_date).toISOString() : new Date().toISOString(),
            })
            .select("id")
            .single();
          if (error || !created) throw new Error(error?.message ?? "Could not create the investor record.");
          applicationId = (created as any).id as string;
        }

        await supabaseAdmin
          .from("investor_fund_access")
          .upsert(
            { user_id: userId, offering_id: data.offeringId, granted_by: who.userId },
            { onConflict: "user_id,offering_id" },
          );

        const { data: position } = await supabaseAdmin
          .from("investor_cap_positions")
          .select("id")
          .eq("application_id", applicationId)
          .maybeSingle();
        const positionPatch = {
          application_id: applicationId,
          offering_id: data.offeringId,
          shares: row.units ?? null,
          notified_committed_cents: Number(row.commitment_cents ?? 0),
          notified_received_cents: Number(row.funded_cents ?? 0),
          notes: `Brought across from ${(migration as any).prior_administrator || "a prior administrator"}${
            (migration as any).records_as_of ? ` as of ${(migration as any).records_as_of}` : ""
          }.${row.note ? ` ${row.note}` : ""}`,
          updated_by: who.userId,
        };
        if (position) {
          await supabaseAdmin
            .from("investor_cap_positions")
            .update(positionPatch)
            .eq("id", (position as any).id);
        } else {
          await supabaseAdmin.from("investor_cap_positions").insert(positionPatch);
        }

        await context.supabase
          .from("fund_migration_rows")
          .update({
            row_status: "imported",
            error_text: null,
            application_id: applicationId,
            imported_at: new Date().toISOString(),
          })
          .eq("id", row.id);

        imported += 1;
      } catch (err) {
        failed += 1;
        await context.supabase
          .from("fund_migration_rows")
          .update({
            row_status: "error",
            error_text: err instanceof Error ? err.message : "Could not bring this record across.",
          })
          .eq("id", row.id);
      }
    }

    await audit(context, who, {
      action: "records brought across",
      offeringId: data.offeringId,
      next: { imported, failed },
    });

    if (imported > 0) {
      await context.supabase
        .from("fund_migrations")
        .update({ status: "records_loaded" })
        .eq("id", (migration as any).id)
        .eq("status", "in_progress");
    }

    return { imported, failed };
  });

export const inviteMigratedInvestors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ offeringId: z.string().uuid(), rowIds: z.array(z.string().uuid()).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await requireSuper(context);

    const { data: migration } = await context.supabase
      .from("fund_migrations")
      .select("id")
      .eq("offering_id", data.offeringId)
      .maybeSingle();
    if (!migration) throw new Error("Start the migration record first.");

    let query = context.supabase
      .from("fund_migration_rows")
      .select("*")
      .eq("migration_id", (migration as any).id)
      .eq("row_status", "imported");
    if (data.rowIds?.length) query = query.in("id", data.rowIds);
    const { data: rows } = await query;

    const list = (rows ?? []) as any[];
    if (!list.length) throw new Error("Bring the records across before sending invitations.");

    let invited = 0;
    for (const row of list) {
      const { error } = await context.supabase.from("fund_invitations").insert({
        email: String(row.email).toLowerCase(),
        invited_name: row.full_name || null,
        offering_id: data.offeringId,
        role: "investor" as any,
        invited_by: who.userId,
        status: "pending",
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });
      if (!error) invited += 1;
    }

    await audit(context, who, {
      action: "invitations recorded",
      offeringId: data.offeringId,
      next: { invited },
    });

    return { invited };
  });
