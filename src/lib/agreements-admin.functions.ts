import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { HARMONIOUS_LEGAL_NAME } from "@/lib/agreement-templates";

/**
 * Harmonious side of Agreements & SOW: pricing the engagement, answering change
 * requests, countersigning, and issuing amendments against executed agreements.
 */

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
] as const;

const CONTRACT_ROLES = [
  "admin",
  "super_admin",
  "legal",
  "client_success",
  "compliance",
  "finance",
  "executive",
] as const;

type Who = { userId: string; email: string; roles: string[]; isStaff: boolean; canManage: boolean };

async function whoIs(context: any): Promise<Who> {
  const { data } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  const roles = ((data ?? []) as any[]).map((r) => String(r.role));
  return {
    userId: context.userId,
    email: (context.claims?.email as string | undefined) ?? "",
    roles,
    isStaff: roles.some((r) => (STAFF_ROLES as readonly string[]).includes(r)),
    canManage: roles.some((r) => (CONTRACT_ROLES as readonly string[]).includes(r)),
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
      "Forbidden: contracting decisions need legal, compliance, finance, client success or admin authority.",
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
    area: "agreements",
    action: entry.action,
    target: entry.target ?? null,
    previous_value: (entry.previous ?? null) as any,
    new_value: (entry.next ?? null) as any,
    source: "web",
  });
}

/* ------------------------------------------------------------------- queue */

export const listAgreementQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const who = await requireStaff(context);

    const [{ data: sows }, { data: clients }, { data: changes }, { data: requests }, { data: snaps }] =
      await Promise.all([
        context.supabase.from("client_sows").select("*").order("created_at", { ascending: false }),
        context.supabase.from("clients").select("id, name, legal_name"),
        context.supabase
          .from("agreement_change_requests")
          .select("id, client_id, sow_id, section_title, status, created_at, updated_at"),
        context.supabase
          .from("fund_requests")
          .select("*")
          .order("created_at", { ascending: false }),
        context.supabase.from("sow_pricing_snapshots").select("sow_id, version_label"),
      ]);

    const clientById = new Map(((clients ?? []) as any[]).map((c) => [c.id, c]));
    const snapBySow = new Map(((snaps ?? []) as any[]).map((s) => [s.sow_id, s.version_label]));
    const openChanges = ((changes ?? []) as any[]).filter(
      (c) => !["resolved", "declined", "approved"].includes(String(c.status)),
    );

    return {
      access: { isStaff: who.isStaff, canManage: who.canManage },
      agreements: ((sows ?? []) as any[]).map((s) => ({
        id: s.id as string,
        clientId: s.client_id as string,
        clientName: clientById.get(s.client_id)?.legal_name || clientById.get(s.client_id)?.name || "—",
        title: s.title as string,
        stage: (s.stage as string) ?? "draft",
        status: s.status as string,
        effectiveDate: (s.effective_date as string) ?? null,
        executedAt: (s.executed_at as string) ?? null,
        pricingVersion: snapBySow.get(s.id) ?? null,
        openChanges: openChanges.filter((c) => c.sow_id === s.id).length,
        createdAt: s.created_at as string,
      })),
      changes: ((changes ?? []) as any[]).map((c) => ({
        id: c.id as string,
        sowId: (c.sow_id as string) ?? null,
        clientId: c.client_id as string,
        clientName: clientById.get(c.client_id)?.legal_name || clientById.get(c.client_id)?.name || "—",
        sectionTitle: c.section_title as string,
        status: c.status as string,
        createdAt: c.created_at as string,
      })),
      requests: ((requests ?? []) as any[]).map((r) => ({
        id: r.id as string,
        clientId: r.client_id as string,
        clientName: clientById.get(r.client_id)?.legal_name || clientById.get(r.client_id)?.name || "—",
        fundName: r.fund_name as string,
        status: r.status as string,
        sowId: (r.sow_id as string) ?? null,
        createdAt: r.created_at as string,
      })),
    };
  });

/* ----------------------------------------------------------------- pricing */

export const updatePricingLine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        lineId: z.string().uuid(),
        finalCents: z.number().int().nonnegative(),
        adjustmentReason: z.string().nullish(),
        included: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const who = await requireAuthority(context);

    const { data: line } = await context.supabase
      .from("sow_pricing_lines")
      .select("*, sow_pricing_snapshots(id, locked, sow_id)")
      .eq("id", data.lineId)
      .maybeSingle();
    if (!line) throw new Error("Pricing line not found.");
    if ((line as any).sow_pricing_snapshots?.locked) {
      throw new Error("This pricing is executed and can only change through an amendment.");
    }

    const standard = Number((line as any).standard_cents ?? 0);
    if (data.finalCents !== standard && !(data.adjustmentReason ?? "").trim()) {
      throw new Error("Record why this price differs from the standard rate.");
    }

    const { error } = await context.supabase
      .from("sow_pricing_lines")
      .update({
        final_cents: data.finalCents,
        adjustment_reason: data.adjustmentReason ?? null,
        ...(data.included === undefined ? {} : { included: data.included }),
      })
      .eq("id", data.lineId);
    if (error) throw new Error(error.message);

    await audit(context, who, {
      action: "sow.pricing_adjusted",
      target: (line as any).label,
      previous: { finalCents: Number((line as any).final_cents ?? 0) },
      next: { finalCents: data.finalCents, reason: data.adjustmentReason ?? null },
    });

    return { ok: true } as const;
  });

export const addPricingLine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        snapshotId: z.string().uuid(),
        label: z.string().min(2),
        serviceKey: z.string().min(2),
        pricingModel: z.string().min(2),
        standardCents: z.number().int().nonnegative(),
        finalCents: z.number().int().nonnegative(),
        adjustmentReason: z.string().nullish(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const who = await requireAuthority(context);
    const { data: snapshot } = await context.supabase
      .from("sow_pricing_snapshots")
      .select("id, locked")
      .eq("id", data.snapshotId)
      .maybeSingle();
    if (!snapshot) throw new Error("Pricing summary not found.");
    if ((snapshot as any).locked) throw new Error("This pricing is executed and cannot change.");

    const { error } = await context.supabase.from("sow_pricing_lines").insert({
      snapshot_id: data.snapshotId,
      service_key: data.serviceKey,
      label: data.label,
      pricing_model: data.pricingModel,
      standard_cents: data.standardCents,
      final_cents: data.finalCents,
      adjustment_reason: data.adjustmentReason ?? null,
      sort_order: 999,
    });
    if (error) throw new Error(error.message);

    await audit(context, who, { action: "sow.pricing_line_added", target: data.label });
    return { ok: true } as const;
  });

/* ----------------------------------------------------------------- changes */

export const respondToChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        changeId: z.string().uuid(),
        decision: z.enum(["approve", "decline", "counter"]),
        note: z.string().nullish(),
        proposedText: z.string().nullish(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const who = await requireAuthority(context);

    const { data: change } = await context.supabase
      .from("agreement_change_requests")
      .select("*")
      .eq("id", data.changeId)
      .maybeSingle();
    if (!change) throw new Error("Change request not found.");

    const now = new Date().toISOString();
    let status = "under_review";
    let finalText: string | null = null;

    if (data.decision === "approve") {
      status = "resolved";
      finalText = (change as any).requested_text as string;
    } else if (data.decision === "decline") {
      status = "declined";
      if (!(data.note ?? "").trim()) throw new Error("Give the client a reason for declining.");
    } else {
      status = "countered";
      if (!(data.proposedText ?? "").trim()) throw new Error("Enter the wording you propose.");
      finalText = (data.proposedText ?? "").trim();
    }

    await context.supabase
      .from("agreement_change_requests")
      .update({
        status,
        final_text: finalText,
        harmonious_response: data.note ?? null,
        responded_by: who.userId,
        responded_at: now,
        resolved_at: status === "resolved" ? now : null,
      })
      .eq("id", data.changeId);

    await context.supabase.from("agreement_change_messages").insert({
      change_request_id: data.changeId,
      author_id: who.userId,
      author_side: "harmonious",
      author_name: who.email,
      body: data.note ?? null,
      proposed_text: finalText,
      status_after: status,
    });

    if (status === "resolved" && (change as any).sow_id && (change as any).section_key) {
      await context.supabase
        .from("sow_sections")
        .update({ body: finalText as string })
        .eq("sow_id", (change as any).sow_id)
        .eq("key", (change as any).section_key);
    }

    await audit(context, who, {
      action: `change.${data.decision}`,
      clientId: (change as any).client_id,
      target: (change as any).section_title,
      next: { status, note: data.note ?? null },
    });

    return { ok: true } as const;
  });

export const sendSowToClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sowId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const who = await requireAuthority(context);
    const { data: sow } = await context.supabase
      .from("client_sows")
      .select("id, client_id, title, executed_at")
      .eq("id", data.sowId)
      .maybeSingle();
    if (!sow) throw new Error("Agreement not found.");
    if ((sow as any).executed_at) throw new Error("This agreement is already executed.");

    await context.supabase.from("client_sows").update({ stage: "in_review" }).eq("id", data.sowId);
    await audit(context, who, {
      action: "sow.sent_for_review",
      clientId: (sow as any).client_id,
      target: (sow as any).title,
    });
    return { ok: true } as const;
  });

/* ------------------------------------------------------------- countersign */

export const countersignSow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        sowId: z.string().uuid(),
        signerName: z.string().min(2),
        signerTitle: z.string().min(1),
        typedSignature: z.string().min(2),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const who = await requireAuthority(context);

    const { data: sow } = await context.supabase
      .from("client_sows")
      .select("*")
      .eq("id", data.sowId)
      .maybeSingle();
    if (!sow) throw new Error("Agreement not found.");
    if ((sow as any).executed_at) return { ok: true, alreadyExecuted: true } as const;

    const { data: signatures } = await context.supabase
      .from("agreement_signatures")
      .select("*")
      .eq("sow_id", data.sowId);
    const clientSignature = ((signatures ?? []) as any[]).find((s) => s.side === "client");
    if (!clientSignature) throw new Error("The client has not signed this agreement yet.");

    const now = new Date().toISOString();
    await context.supabase.from("agreement_signatures").insert({
      scope: "sow",
      client_id: (sow as any).client_id,
      sow_id: data.sowId,
      side: "harmonious",
      company: HARMONIOUS_LEGAL_NAME,
      signer_name: data.signerName,
      signer_title: data.signerTitle,
      signer_email: who.email,
      signer_user_id: who.userId,
      typed_signature: data.typedSignature,
      version_label: `v${Number((sow as any).sow_version ?? 1)}`,
    });

    const [{ data: sections }, { data: snapshot }, { data: changes }] = await Promise.all([
      context.supabase.from("sow_sections").select("*").eq("sow_id", data.sowId).order("sort_order"),
      context.supabase
        .from("sow_pricing_snapshots")
        .select("*")
        .eq("sow_id", data.sowId)
        .maybeSingle(),
      context.supabase.from("agreement_change_requests").select("*").eq("sow_id", data.sowId),
    ]);

    const { data: lines } = snapshot
      ? await context.supabase
          .from("sow_pricing_lines")
          .select("*")
          .eq("snapshot_id", (snapshot as any).id)
          .order("sort_order")
      : { data: [] as any[] };

    await context.supabase.from("agreement_executions").insert({
      scope: "sow",
      client_id: (sow as any).client_id,
      sow_id: data.sowId,
      snapshot: {
        title: (sow as any).title,
        effectiveDate: (sow as any).effective_date,
        noticeDays: (sow as any).notice_days,
        sections: sections ?? [],
        pricing: { version: (snapshot as any)?.version_label ?? null, lines: lines ?? [] },
        changes: changes ?? [],
        signatures: [
          {
            side: "client",
            name: clientSignature.signer_name,
            title: clientSignature.signer_title,
            signedAt: clientSignature.signed_at,
          },
          { side: "harmonious", name: data.signerName, title: data.signerTitle, signedAt: now },
        ],
      } as any,
      executed_at: now,
    });

    if (snapshot) {
      await context.supabase
        .from("sow_pricing_snapshots")
        .update({ locked: true })
        .eq("id", (snapshot as any).id);

      const included = ((lines ?? []) as any[]).filter((l) => l.included);
      if (included.length) {
        await context.supabase.from("client_pricing").insert(
          included.map((l) => ({
            client_id: (sow as any).client_id,
            sow_id: data.sowId,
            service_key: l.service_key,
            label: l.label,
            standard_cents: Number(l.standard_cents ?? 0),
            contracted_cents: Number(l.final_cents ?? 0),
            discount_note: l.adjustment_reason ?? null,
            pricing_model: l.pricing_model ?? "annual",
            version_id: (snapshot as any).version_id ?? null,
            effective_date: (sow as any).effective_date ?? null,
            approved_by: who.userId,
            approved_at: now,
          })),
        );
      }
    }

    await context.supabase
      .from("client_sows")
      .update({
        stage: "executed",
        status: "active",
        locked: true,
        executed_at: now,
        approval_status: "approved",
        approved_by: who.userId,
        approved_at: now,
      })
      .eq("id", data.sowId);

    if ((sow as any).fund_request_id) {
      await context.supabase
        .from("fund_requests")
        .update({ status: "executed" })
        .eq("id", (sow as any).fund_request_id);
    }

    await audit(context, who, {
      action: "sow.executed",
      clientId: (sow as any).client_id,
      target: (sow as any).title,
      next: { countersignedBy: data.signerName, executedAt: now },
    });

    return { ok: true, alreadyExecuted: false } as const;
  });

/* -------------------------------------------------------------- amendments */

export const createAmendment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        sowId: z.string().uuid(),
        title: z.string().min(2),
        existingTerms: z.string().min(2),
        requestedChange: z.string().min(2),
        newTerms: z.string().min(2),
        effectiveDate: z.string().nullish(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const who = await requireAuthority(context);
    const { data: sow } = await context.supabase
      .from("client_sows")
      .select("id, client_id, title, executed_at")
      .eq("id", data.sowId)
      .maybeSingle();
    if (!sow) throw new Error("Agreement not found.");
    if (!(sow as any).executed_at) {
      throw new Error("Only an executed agreement is amended. Edit the draft instead.");
    }

    const { data: existing } = await context.supabase
      .from("sow_amendments")
      .select("amendment_no")
      .eq("sow_id", data.sowId)
      .order("amendment_no", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextNo = Number((existing as any)?.amendment_no ?? 0) + 1;
    const { data: created, error } = await context.supabase
      .from("sow_amendments")
      .insert({
        sow_id: data.sowId,
        client_id: (sow as any).client_id,
        amendment_no: nextNo,
        title: data.title,
        existing_terms: data.existingTerms,
        requested_change: data.requestedChange,
        new_terms: data.newTerms,
        effective_date: data.effectiveDate || null,
        status: "pending_signature",
        created_by: who.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await audit(context, who, {
      action: "sow.amendment_created",
      clientId: (sow as any).client_id,
      target: `${(sow as any).title} — amendment ${nextNo}`,
    });

    return { id: (created as any).id as string, amendmentNo: nextNo };
  });

export const executeAmendment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        amendmentId: z.string().uuid(),
        signerName: z.string().min(2),
        signerTitle: z.string().min(1),
        typedSignature: z.string().min(2),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const who = await requireAuthority(context);
    const { data: amendment } = await context.supabase
      .from("sow_amendments")
      .select("*")
      .eq("id", data.amendmentId)
      .maybeSingle();
    if (!amendment) throw new Error("Amendment not found.");
    if ((amendment as any).executed_at) return { ok: true } as const;

    const now = new Date().toISOString();
    await context.supabase.from("agreement_signatures").insert({
      scope: "amendment",
      client_id: (amendment as any).client_id,
      sow_id: (amendment as any).sow_id,
      amendment_id: (amendment as any).id,
      side: "harmonious",
      company: HARMONIOUS_LEGAL_NAME,
      signer_name: data.signerName,
      signer_title: data.signerTitle,
      signer_email: who.email,
      signer_user_id: who.userId,
      typed_signature: data.typedSignature,
      version_label: `amendment ${Number((amendment as any).amendment_no)}`,
    });

    await context.supabase
      .from("sow_amendments")
      .update({ status: "executed", executed_at: now })
      .eq("id", data.amendmentId);

    await context.supabase.from("agreement_executions").insert({
      scope: "amendment",
      client_id: (amendment as any).client_id,
      sow_id: (amendment as any).sow_id,
      amendment_id: (amendment as any).id,
      snapshot: amendment as any,
      executed_at: now,
    });

    await audit(context, who, {
      action: "sow.amendment_executed",
      clientId: (amendment as any).client_id,
      target: (amendment as any).title,
    });

    return { ok: true } as const;
  });

/* ------------------------------------------------------------- the document */

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Returns the executed agreement as a branded, printable document. */
export const getAgreementDocument = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sowId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: sow } = await context.supabase
      .from("client_sows")
      .select("*")
      .eq("id", data.sowId)
      .maybeSingle();
    if (!sow) throw new Error("Agreement not found.");

    const [{ data: client }, { data: sections }, { data: snapshot }, { data: signatures }] =
      await Promise.all([
        context.supabase
          .from("clients")
          .select("name, legal_name")
          .eq("id", (sow as any).client_id)
          .maybeSingle(),
        context.supabase.from("sow_sections").select("*").eq("sow_id", data.sowId).order("sort_order"),
        context.supabase
          .from("sow_pricing_snapshots")
          .select("*")
          .eq("sow_id", data.sowId)
          .maybeSingle(),
        context.supabase
          .from("agreement_signatures")
          .select("*")
          .eq("sow_id", data.sowId)
          .order("signed_at"),
      ]);

    const { data: lines } = snapshot
      ? await context.supabase
          .from("sow_pricing_lines")
          .select("*")
          .eq("snapshot_id", (snapshot as any).id)
          .order("sort_order")
      : { data: [] as any[] };

    const clientName = ((client as any)?.legal_name || (client as any)?.name || "Client") as string;
    const body = ((sections ?? []) as any[])
      .map(
        (s) =>
          `<section><h2>${escapeHtml(s.section_no)}. ${escapeHtml(s.title)}</h2><p>${escapeHtml(
            String(s.body),
          ).replace(/\n/g, "<br/>")}</p></section>`,
      )
      .join("");

    const pricingRows = ((lines ?? []) as any[])
      .filter((l) => l.included)
      .map(
        (l) =>
          `<tr><td>${escapeHtml(l.label)}</td><td>${escapeHtml(String(l.pricing_model))}</td><td class="r">${
            l.pass_through ? "At cost" : money(Number(l.final_cents ?? 0))
          }</td></tr>`,
      )
      .join("");

    const signatureBlocks = ((signatures ?? []) as any[])
      .map(
        (s) =>
          `<div class="sig"><p class="sig-name">${escapeHtml(s.typed_signature)}</p><p>${escapeHtml(
            s.signer_name,
          )}${s.signer_title ? `, ${escapeHtml(s.signer_title)}` : ""}</p><p class="muted">${
            s.side === "client" ? escapeHtml(clientName) : HARMONIOUS_LEGAL_NAME
          } · ${new Date(s.signed_at).toLocaleString("en-US")}</p></div>`,
      )
      .join("");

    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>${escapeHtml(
      (sow as any).title,
    )}</title><style>
      body{font-family:Poppins,system-ui,sans-serif;color:#221F20;max-width:820px;margin:0 auto;padding:48px 32px;line-height:1.6}
      h1,h2{font-family:Rubik,system-ui,sans-serif;color:#142647}
      h1{font-size:26px;margin-bottom:4px}
      h2{font-size:17px;margin:28px 0 6px}
      .meta{color:#5b6472;font-size:13px}
      table{width:100%;border-collapse:collapse;margin-top:12px;font-size:14px}
      th,td{border-bottom:1px solid #e3e7ee;padding:8px;text-align:left}
      .r{text-align:right}
      .sig{margin-top:24px;border-top:2px solid #5DC6D1;padding-top:8px;font-size:14px}
      .sig-name{font-family:'Brush Script MT',cursive;font-size:24px;color:#142647;margin:0}
      .muted{color:#5b6472;font-size:12px}
      p{margin:6px 0}
    </style></head><body>
      <h1>${escapeHtml((sow as any).title)}</h1>
      <p class="meta">${escapeHtml(clientName)} and ${HARMONIOUS_LEGAL_NAME} · Effective ${
        (sow as any).effective_date ?? "—"
      }${(sow as any).executed_at ? ` · Executed ${new Date((sow as any).executed_at).toLocaleDateString("en-US")}` : " · Draft"}</p>
      ${body}
      <h2>Pricing summary${
        (snapshot as any)?.version_label ? ` (${escapeHtml((snapshot as any).version_label)})` : ""
      }</h2>
      <table><thead><tr><th>Service</th><th>Basis</th><th class="r">Fee</th></tr></thead><tbody>${
        pricingRows || '<tr><td colspan="3">No priced services.</td></tr>'
      }</tbody></table>
      <h2>Signatures</h2>
      ${signatureBlocks || "<p>Not yet signed.</p>"}
    </body></html>`;

    return { html, filename: `${(sow as any).title.replace(/[^\w-]+/g, "-")}.html` };
  });
