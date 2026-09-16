import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Harmonious CapTable — Phase 5: bringing an existing cap table across.
 *
 * A file upload becomes a reviewable batch: we detect where it came from, map
 * the columns, flag anything that looks wrong and reconcile against what is
 * already recorded. Nothing touches the official ledger until someone with
 * authority deliberately accepts the batch.
 */

import { MIGRATION_FIELDS, type MigrationFieldKey as FieldKey } from "./captable-migration-fields";

const SYNONYMS: Record<FieldKey, string[]> = {
  holderName: ["stakeholder", "stakeholder name", "holder", "holder name", "name", "shareholder", "shareholder name", "investor", "investor name", "full name"],
  holderEmail: ["email", "email address", "stakeholder email", "holder email", "contact email"],
  holderType: ["type", "stakeholder type", "holder type", "relationship", "category"],
  securityType: ["security type", "security", "instrument", "equity type", "grant type", "share type", "class type", "award type"],
  securityClass: ["share class", "class", "security class", "stock class", "series"],
  label: ["certificate", "certificate number", "certificate no", "cert", "label", "grant id", "security id", "reference"],
  quantity: ["quantity", "shares", "number of shares", "units", "qty", "share quantity", "options", "number of options", "granted"],
  issueDate: ["issue date", "issued", "date issued", "grant date", "issue", "date"],
  pricePerShare: ["price per share", "pps", "issue price", "purchase price", "price", "share price"],
  exercisePrice: ["exercise price", "strike", "strike price", "exercise"],
  vestingStart: ["vesting start", "vesting start date", "vest start", "vesting commencement", "vesting commencement date"],
  cliffMonths: ["cliff", "cliff months", "vesting cliff", "cliff (months)"],
  durationMonths: ["vesting period", "vesting months", "vesting duration", "duration", "vesting length", "vesting term"],
  frequency: ["vesting frequency", "frequency", "vesting interval", "vests"],
  authorizedShares: ["authorized", "authorised", "authorized shares", "authorised shares", "shares authorized", "class authorized", "authorized amount"],
  roundName: ["round", "round name", "financing", "financing round", "funding round", "series name", "transaction name", "deal"],
  roundDate: ["round date", "closing date", "close date", "financing date", "transaction date"],
  roundPricePerShare: ["round price per share", "round pps", "financing price", "round price"],
  investmentAmount: ["investment amount", "amount invested", "invested", "amount", "total investment", "purchase amount", "consideration"],
};

const PROVIDER_SIGNATURES: Array<{ id: string; label: string; markers: string[] }> = [
  { id: "carta", label: "Carta", markers: ["stakeholder name", "security type", "vesting schedule", "issue date", "quantity issued"] },
  { id: "pulley", label: "Pulley", markers: ["holder", "share class", "vesting start date", "granted", "security id"] },
  { id: "angellist", label: "AngelList", markers: ["investor name", "investment amount", "spv"] },
];

function norm(value: string) {
  return String(value ?? "").trim().toLowerCase().replace(/[_\-.]+/g, " ").replace(/\s+/g, " ");
}

function detectProvider(headers: string[]) {
  const set = new Set(headers.map(norm));
  let best: { id: string; label: string; hits: number } | null = null;
  for (const provider of PROVIDER_SIGNATURES) {
    const hits = provider.markers.filter((m) => set.has(m)).length;
    if (hits >= 2 && (!best || hits > best.hits)) best = { id: provider.id, label: provider.label, hits };
  }
  return best ? { id: best.id, label: best.label } : { id: "file", label: "Spreadsheet" };
}

/** Best-guess column for each field: exact synonym first, then a contains match. */
function autoMap(headers: string[]) {
  const mapping: Record<string, string | null> = {};
  const used = new Set<string>();
  for (const field of MIGRATION_FIELDS) {
    const options = SYNONYMS[field.key];
    let found =
      headers.find((h) => !used.has(h) && options.includes(norm(h))) ??
      headers.find((h) => !used.has(h) && options.some((o) => norm(h).includes(o)));
    if (found) used.add(found);
    mapping[field.key] = found ?? null;
  }
  return mapping;
}

function num(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function isoDate(value: unknown) {
  if (!value) return null;
  const raw = String(value).trim();
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function securityType(value: unknown) {
  const v = norm(String(value ?? ""));
  if (!v) return null;
  if (v.includes("iso")) return "iso_option";
  if (v.includes("nso") || v.includes("non qualified") || v.includes("nq")) return "nso_option";
  if (v.includes("option")) return "option";
  if (v.includes("rsu") || v.includes("restricted stock unit")) return "rsu";
  if (v.includes("warrant")) return "warrant";
  if (v.includes("safe")) return "safe";
  if (v.includes("note") || v.includes("convertible")) return "convertible_note";
  if (v.includes("preferred")) return "preferred_stock";
  if (v.includes("common") || v.includes("ordinary") || v.includes("share") || v.includes("stock")) return "common_stock";
  return "common_stock";
}

function holderType(value: unknown, type: string | null) {
  const v = norm(String(value ?? ""));
  if (v.includes("founder")) return "founder";
  if (v.includes("employee")) return "employee";
  if (v.includes("advisor") || v.includes("consultant")) return "advisor";
  if (v.includes("fund")) return "fund";
  if (v.includes("entity") || v.includes("company") || v.includes("llc")) return "entity";
  if (v.includes("investor") || v.includes("angel")) return "investor";
  if (type && type.includes("option")) return "employee";
  if (type === "rsu") return "employee";
  return "investor";
}

function frequency(value: unknown) {
  const v = norm(String(value ?? ""));
  if (!v) return "monthly";
  if (v.includes("annual") || v.includes("year")) return "annual";
  if (v.includes("quarter")) return "quarterly";
  if (v.includes("day") || v.includes("daily")) return "daily";
  return "monthly";
}

type MappedRow = {
  holderName: string | null;
  holderEmail: string | null;
  holderType: string;
  securityType: string | null;
  securityClass: string | null;
  label: string | null;
  quantity: number | null;
  issueDate: string | null;
  pricePerShare: number | null;
  exercisePrice: number | null;
  vestingStart: string | null;
  cliffMonths: number | null;
  durationMonths: number | null;
  frequency: string;
};

function mapRow(raw: Record<string, unknown>, mapping: Record<string, string | null>) {
  const pick = (key: FieldKey) => {
    const column = mapping[key];
    return column ? raw[column] : null;
  };

  const type = securityType(pick("securityType"));
  const mapped: MappedRow = {
    holderName: pick("holderName") ? String(pick("holderName")).trim() : null,
    holderEmail: pick("holderEmail") ? String(pick("holderEmail")).trim().toLowerCase() : null,
    holderType: holderType(pick("holderType"), type),
    securityType: type,
    securityClass: pick("securityClass") ? String(pick("securityClass")).trim() : null,
    label: pick("label") ? String(pick("label")).trim() : null,
    quantity: num(pick("quantity")),
    issueDate: isoDate(pick("issueDate")),
    pricePerShare: num(pick("pricePerShare")),
    exercisePrice: num(pick("exercisePrice")),
    vestingStart: isoDate(pick("vestingStart")),
    cliffMonths: num(pick("cliffMonths")),
    durationMonths: num(pick("durationMonths")),
    frequency: frequency(pick("frequency")),
  };

  const issues: string[] = [];
  if (!mapped.holderName) issues.push("No shareholder name on this line.");
  if (mapped.quantity === null) issues.push("Quantity is missing or could not be read.");
  else if (mapped.quantity <= 0) issues.push("Quantity must be greater than zero.");
  if (!mapped.securityType) issues.push("Security type is missing.");
  if (mapped.holderEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mapped.holderEmail)) {
    issues.push("Email address does not look valid.");
  }
  if (mapped.vestingStart && !mapped.durationMonths) {
    issues.push("Vesting start given without a vesting length — vesting will not be tracked.");
  }
  return { mapped, issues };
}

async function assertManage(context: any, companyId: string) {
  const { data } = await context.supabase.rpc("ct_can_manage", { _company_id: companyId });
  if (!data) throw new Error("You do not have authority to change this cap table.");
  const { data: company } = await context.supabase
    .from("ct_companies")
    .select("is_demo")
    .eq("id", companyId)
    .maybeSingle();
  if (company?.is_demo) throw new Error("The demo company is read-only. Switch to your own company first.");
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

/* ------------------------------------------------------------------ reading */

export const getCapMigrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ companyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [{ data: canManage }, { data: batches }, { data: stakeholders }, { data: company }] =
      await Promise.all([
        supabase.rpc("ct_can_manage", { _company_id: data.companyId }),
        supabase
          .from("ct_migrations")
          .select("*")
          .eq("company_id", data.companyId)
          .order("created_at", { ascending: false }),
        supabase
          .from("ct_stakeholders")
          .select("id, name, email")
          .eq("company_id", data.companyId),
        supabase.from("ct_companies").select("is_demo").eq("id", data.companyId).maybeSingle(),
      ]);

    const ids = ((batches ?? []) as any[]).map((b) => b.id);
    const { data: rows } = ids.length
      ? await supabase
          .from("ct_migration_rows")
          .select("*")
          .in("migration_id", ids)
          .order("row_number")
      : { data: [] as any[] };

    return {
      canManage: Boolean(canManage) && !company?.is_demo,
      isDemo: Boolean(company?.is_demo),
      stakeholders: ((stakeholders ?? []) as any[]).map((s) => ({
        id: s.id as string,
        name: s.name as string,
        email: (s.email as string | null) ?? null,
      })),
      migrations: ((batches ?? []) as any[]).map((b) => {
        const mine = ((rows ?? []) as any[]).filter((r) => r.migration_id === b.id);
        return {
          id: b.id as string,
          fileName: (b.file_name as string | null) ?? null,
          detectedProvider: (b.detected_provider as string | null) ?? null,
          sourceProvider: b.source_provider as string,
          status: b.status as string,
          mapping: (b.mapping ?? {}) as Record<string, string | null>,
          headers: (b.headers ?? []) as string[],
          rowCount: Number(b.row_count ?? 0),
          notes: (b.notes as string | null) ?? null,
          conciergeRequestedAt: (b.concierge_requested_at as string | null) ?? null,
          conciergeNote: (b.concierge_note as string | null) ?? null,
          importedAt: (b.imported_at as string | null) ?? null,
          createdAt: b.created_at as string,
          counts: {
            total: mine.length,
            ready: mine.filter((r) => r.status === "ready").length,
            error: mine.filter((r) => r.status === "error").length,
            skipped: mine.filter((r) => r.status === "skipped").length,
            imported: mine.filter((r) => r.status === "imported").length,
            matched: mine.filter((r) => r.match_stakeholder_id).length,
          },
          rows: mine.map((r) => ({
            id: r.id as string,
            rowNumber: Number(r.row_number ?? 0),
            raw: (r.raw ?? {}) as Record<string, string | null>,
            mapped: (r.mapped ?? {}) as MappedRow,
            issues: (r.issues ?? []) as string[],
            matchStakeholderId: (r.match_stakeholder_id as string | null) ?? null,
            status: r.status as string,
          })),
        };
      }),
    };
  });

/* ------------------------------------------------------------------ writing */

const rowInput = z.record(z.string(), z.any());

export const createCapMigration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        fileName: z.string().trim().max(240).optional().nullable(),
        headers: z.array(z.string()).min(1),
        rows: z.array(rowInput).min(1).max(5000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertManage(context, data.companyId);
    const { supabase, userId } = context;

    const provider = detectProvider(data.headers);
    const mapping = autoMap(data.headers);

    const { data: batch, error } = await supabase
      .from("ct_migrations")
      .insert({
        company_id: data.companyId,
        file_name: data.fileName || null,
        detected_provider: provider.label,
        source_provider: provider.id,
        status: "mapped",
        mapping,
        headers: data.headers,
        row_count: data.rows.length,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await writeRows(context, data.companyId, batch.id as string, data.rows, mapping);
    await recordEvent(context, {
      companyId: data.companyId,
      action: "migration.uploaded",
      entityId: batch.id as string,
      next: { file: data.fileName, provider: provider.label, rows: data.rows.length },
      reason: "Cap table file uploaded for review",
    });
    return { id: batch.id as string, provider: provider.label };
  });

async function writeRows(
  context: any,
  companyId: string,
  migrationId: string,
  rawRows: Array<Record<string, unknown>>,
  mapping: Record<string, string | null>,
) {
  const { supabase } = context;
  const { data: stakeholders } = await supabase
    .from("ct_stakeholders")
    .select("id, name, email")
    .eq("company_id", companyId);
  const byEmail = new Map(
    ((stakeholders ?? []) as any[])
      .filter((s) => s.email)
      .map((s) => [String(s.email).toLowerCase(), s.id]),
  );
  const byName = new Map(((stakeholders ?? []) as any[]).map((s) => [norm(s.name), s.id]));

  const payload = rawRows.map((raw, index) => {
    const { mapped, issues } = mapRow(raw, mapping);
    const match =
      (mapped.holderEmail ? byEmail.get(mapped.holderEmail) : null) ??
      (mapped.holderName ? byName.get(norm(mapped.holderName)) : null) ??
      null;
    return {
      migration_id: migrationId,
      company_id: companyId,
      row_number: index + 1,
      raw: raw as any,
      mapped: mapped as any,
      issues: issues as any,
      match_stakeholder_id: match,
      status: issues.length ? "error" : "ready",
    };
  });

  for (let i = 0; i < payload.length; i += 500) {
    const { error } = await supabase.from("ct_migration_rows").insert(payload.slice(i, i + 500));
    if (error) throw new Error(error.message);
  }
}

export const remapCapMigration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        migrationId: z.string().uuid(),
        mapping: z.record(z.string(), z.string().nullable()),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: batch } = await supabase
      .from("ct_migrations")
      .select("id, company_id, status")
      .eq("id", data.migrationId)
      .maybeSingle();
    if (!batch) throw new Error("Migration not found.");
    if (batch.status === "imported") throw new Error("This batch has already been accepted.");
    await assertManage(context, batch.company_id as string);

    const { data: rows } = await supabase
      .from("ct_migration_rows")
      .select("raw")
      .eq("migration_id", data.migrationId)
      .order("row_number");
    const raws = ((rows ?? []) as any[]).map((r) => (r.raw ?? {}) as Record<string, unknown>);

    await supabase.from("ct_migration_rows").delete().eq("migration_id", data.migrationId);
    await supabase
      .from("ct_migrations")
      .update({ mapping: data.mapping as any, status: "mapped" })
      .eq("id", data.migrationId);
    await writeRows(context, batch.company_id as string, data.migrationId, raws, data.mapping);

    await recordEvent(context, {
      companyId: batch.company_id as string,
      action: "migration.remapped",
      entityId: data.migrationId,
      next: data.mapping,
      reason: "Column mapping changed",
    });
    return { ok: true };
  });

export const setCapMigrationRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        rowId: z.string().uuid(),
        status: z.enum(["ready", "skipped"]).optional(),
        matchStakeholderId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row } = await supabase
      .from("ct_migration_rows")
      .select("id, company_id, status, issues")
      .eq("id", data.rowId)
      .maybeSingle();
    if (!row) throw new Error("Line not found.");
    if (row.status === "imported") throw new Error("This line is already on the cap table.");
    await assertManage(context, row.company_id as string);

    const patch: Record<string, unknown> = {};
    if (data.status) {
      if (data.status === "ready" && ((row.issues ?? []) as string[]).length) {
        throw new Error("Fix the problems on this line before marking it ready.");
      }
      patch['status'] = data.status;
    }
    if (data.matchStakeholderId !== undefined) patch['match_stakeholder_id'] = data.matchStakeholderId;
    const { error } = await supabase.from("ct_migration_rows").update(patch as any).eq("id", data.rowId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const requestCapConcierge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ migrationId: z.string().uuid(), note: z.string().trim().max(2000).optional().nullable() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: batch } = await supabase
      .from("ct_migrations")
      .select("id, company_id")
      .eq("id", data.migrationId)
      .maybeSingle();
    if (!batch) throw new Error("Migration not found.");
    await assertManage(context, batch.company_id as string);

    const { error } = await supabase
      .from("ct_migrations")
      .update({
        concierge_requested_at: new Date().toISOString(),
        concierge_note: data.note || null,
        status: "in_review",
      })
      .eq("id", data.migrationId);
    if (error) throw new Error(error.message);

    await recordEvent(context, {
      companyId: batch.company_id as string,
      action: "migration.concierge_requested",
      entityId: data.migrationId,
      reason: data.note || "Concierge review requested",
    });
    return { ok: true };
  });

export const cancelCapMigration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ migrationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: batch } = await supabase
      .from("ct_migrations")
      .select("id, company_id, status")
      .eq("id", data.migrationId)
      .maybeSingle();
    if (!batch) throw new Error("Migration not found.");
    if (batch.status === "imported") throw new Error("An accepted batch cannot be cancelled.");
    await assertManage(context, batch.company_id as string);

    await supabase.from("ct_migrations").update({ status: "cancelled" }).eq("id", data.migrationId);
    await recordEvent(context, {
      companyId: batch.company_id as string,
      action: "migration.cancelled",
      entityId: data.migrationId,
    });
    return { ok: true };
  });

/**
 * Accept the batch. Every ready line becomes a stakeholder (matched or new),
 * a security and an opening issuance transaction, so ownership is derived the
 * same way as everything else. Lines already imported are left alone, so a
 * repeated accept cannot duplicate holdings.
 */
export const importCapMigration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ migrationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: batch } = await supabase
      .from("ct_migrations")
      .select("id, company_id, status")
      .eq("id", data.migrationId)
      .maybeSingle();
    if (!batch) throw new Error("Migration not found.");
    if (batch.status === "imported") throw new Error("This batch has already been accepted.");
    if (batch.status === "cancelled") throw new Error("This batch was cancelled.");
    const companyId = batch.company_id as string;
    await assertManage(context, companyId);

    // When Harmonious prepared this batch for the founder, nothing is recorded
    // until the founder has approved what we prepared.
    const { data: conciergeCase } = await supabase
      .from("ct_concierge_cases")
      .select("id, review_status, stage")
      .eq("migration_id", data.migrationId)
      .maybeSingle();
    if (conciergeCase && conciergeCase.review_status !== "approved") {
      throw new Error(
        "Harmonious is preparing this batch. It can only be recorded once the founder has approved it.",
      );
    }

    const { data: rows } = await supabase
      .from("ct_migration_rows")
      .select("*")
      .eq("migration_id", data.migrationId)
      .eq("status", "ready")
      .order("row_number");

    const ready = (rows ?? []) as any[];
    if (ready.length === 0) throw new Error("There are no ready lines to accept.");

    const { data: classes } = await supabase
      .from("ct_security_classes")
      .select("id, name")
      .eq("company_id", companyId);
    const classByName = new Map(((classes ?? []) as any[]).map((c) => [norm(c.name), c.id]));

    let stakeholdersCreated = 0;
    let securitiesCreated = 0;

    for (const row of ready) {
      const mapped = (row.mapped ?? {}) as MappedRow;
      let stakeholderId = row.match_stakeholder_id as string | null;

      if (!stakeholderId) {
        const { data: created, error: sErr } = await supabase
          .from("ct_stakeholders")
          .insert({
            company_id: companyId,
            name: mapped.holderName ?? "Unnamed shareholder",
            email: mapped.holderEmail,
            stakeholder_type: mapped.holderType,
          })
          .select("id")
          .single();
        if (sErr) throw new Error(sErr.message);
        stakeholderId = created.id as string;
        stakeholdersCreated += 1;
      }

      let scheduleId: string | null = null;
      if (mapped.vestingStart && mapped.durationMonths) {
        const { data: sched } = await supabase
          .from("ct_vesting_schedules")
          .insert({
            company_id: companyId,
            name: `${mapped.holderName ?? "Grant"} — imported schedule`,
            start_date: mapped.vestingStart,
            cliff_months: mapped.cliffMonths ?? 0,
            duration_months: mapped.durationMonths ?? 0,
            frequency: mapped.frequency,
          })
          .select("id")
          .single();
        scheduleId = (sched?.id as string) ?? null;
      }

      const { data: security, error: secErr } = await supabase
        .from("ct_securities")
        .insert({
          company_id: companyId,
          stakeholder_id: stakeholderId,
          class_id: mapped.securityClass ? (classByName.get(norm(mapped.securityClass)) ?? null) : null,
          security_type: mapped.securityType ?? "common_stock",
          label: mapped.label,
          quantity: mapped.quantity ?? 0,
          issue_date: mapped.issueDate,
          purchase_price: mapped.pricePerShare,
          exercise_price: mapped.exercisePrice,
          vesting_schedule_id: scheduleId,
          status: "outstanding",
          verification_status: "migrated",
        })
        .select("id")
        .single();
      if (secErr) throw new Error(secErr.message);
      securitiesCreated += 1;

      await supabase.from("ct_transactions").insert({
        company_id: companyId,
        security_id: security.id,
        stakeholder_id: stakeholderId,
        kind: "issuance",
        quantity: mapped.quantity ?? 0,
        amount: mapped.pricePerShare && mapped.quantity ? mapped.pricePerShare * mapped.quantity : null,
        effective_date: mapped.issueDate ?? new Date().toISOString().slice(0, 10),
        status: "recorded",
        reason: "Imported from a prior cap table record",
        metadata: { migration_id: data.migrationId, row_number: row.row_number } as unknown as Record<string, never>,
        created_by: userId,
      });

      await supabase
        .from("ct_migration_rows")
        .update({ status: "imported", created_security_id: security.id, match_stakeholder_id: stakeholderId })
        .eq("id", row.id);
    }

    await supabase
      .from("ct_migrations")
      .update({ status: "imported", imported_at: new Date().toISOString(), imported_by: userId })
      .eq("id", data.migrationId);

    await recordEvent(context, {
      companyId,
      action: "migration.accepted",
      entityId: data.migrationId,
      next: { stakeholdersCreated, securitiesCreated, lines: ready.length },
      reason: "Migration accepted onto the cap table",
    });

    if (conciergeCase) {
      await supabase
        .from("ct_concierge_cases")
        .update({ stage: "recorded", recorded_at: new Date().toISOString() })
        .eq("id", conciergeCase.id);
    }

    return { stakeholdersCreated, securitiesCreated, lines: ready.length };
  });
