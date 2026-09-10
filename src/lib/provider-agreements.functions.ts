import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CONTRACT_ROLES, STAFF_ROLES } from "@/lib/contracts.functions";

/** How a provider charges for a line of work. */
export const RATE_BASES = [
  { value: "per_fund", label: "Per fund" },
  { value: "per_investor", label: "Per investor" },
  { value: "monthly", label: "Monthly" },
  { value: "annual", label: "Annual" },
  { value: "hourly", label: "Hourly" },
  { value: "one_off", label: "One-off" },
  { value: "pass_through", label: "Pass-through at cost" },
] as const;

/** Stages a provider agreement moves through. */
export const AGREEMENT_STAGES = [
  { value: "draft", label: "Draft" },
  { value: "in_review", label: "In review" },
  { value: "signed", label: "Signed" },
  { value: "active", label: "Active" },
  { value: "expired", label: "Expired" },
  { value: "terminated", label: "Terminated" },
] as const;

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
      "Forbidden: provider agreements can only be changed by legal, compliance, finance, client success or admin.",
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
    previous?: unknown;
    next?: unknown;
  },
) {
  await context.supabase.from("contract_audit_events").insert({
    actor_id: who.userId,
    actor_role: "staff",
    area: "provider agreement",
    action: entry.action,
    target: entry.target ?? null,
    previous_value: (entry.previous ?? null) as any,
    new_value: (entry.next ?? null) as any,
    source: "web",
  });
}

async function loadAgreement(context: any, id: string) {
  const { data, error } = await context.supabase
    .from("provider_agreements")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("That provider agreement is not available.");
  return data as any;
}

/** Every provider agreement with its rates and conditions. */
export const listProviderAgreements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const who = await requireStaff(context);
    const [{ data: agreements, error }, { data: providers }, { data: rates }, { data: conditions }] =
      await Promise.all([
        context.supabase
          .from("provider_agreements")
          .select("*")
          .order("created_at", { ascending: false }),
        context.supabase
          .from("third_party_providers")
          .select("id, name, provider_type, contract_status, retired_at")
          .order("name"),
        context.supabase.from("provider_agreement_rates").select("*").order("sort_order"),
        context.supabase.from("provider_agreement_conditions").select("*").order("sort_order"),
      ]);
    if (error) throw new Error(error.message);
    return {
      agreements: (agreements ?? []) as any[],
      providers: (providers ?? []) as any[],
      rates: (rates ?? []) as any[],
      conditions: (conditions ?? []) as any[],
      canManage: who.canManage,
    };
  });

const agreementInput = z.object({
  id: z.string().uuid().optional(),
  providerId: z.string().uuid(),
  title: z.string().min(2),
  reference: z.string().optional().default(""),
  scopeSummary: z.string().optional().default(""),
  services: z.array(z.string()).optional().default([]),
  startDate: z.string().optional().default(""),
  endDate: z.string().optional().default(""),
  noticeDays: z.number().int().min(0).max(365).optional().default(60),
  documentUrl: z.string().optional().default(""),
  note: z.string().optional().default(""),
});

/** Create or update the agreement itself. Only draft and in-review terms can change. */
export const saveProviderAgreement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => agreementInput.parse(d))
  .handler(async ({ data, context }) => {
    const who = await requireAuthority(context);
    const row = {
      provider_id: data.providerId,
      title: data.title.trim(),
      reference: data.reference.trim() || null,
      scope_summary: data.scopeSummary.trim() || null,
      services: data.services,
      start_date: data.startDate || null,
      end_date: data.endDate || null,
      notice_days: data.noticeDays,
      document_url: data.documentUrl.trim() || null,
      note: data.note.trim() || null,
    };

    if (data.id) {
      const previous = await loadAgreement(context, data.id);
      if (["terminated", "expired"].includes(String(previous.status))) {
        throw new Error("A closed agreement can no longer be edited.");
      }
      const { error } = await context.supabase
        .from("provider_agreements")
        .update(row)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      await audit(context, who, {
        action: "updated",
        target: row.title,
        previous,
        next: row,
      });
      return { id: data.id };
    }

    const { data: created, error } = await context.supabase
      .from("provider_agreements")
      .insert({ ...row, status: "draft", created_by: who.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await audit(context, who, { action: "created", target: row.title, next: row });
    return { id: (created as any).id as string };
  });

/** Add or change one price line. */
export const saveAgreementRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        agreementId: z.string().uuid(),
        label: z.string().min(2),
        description: z.string().optional().default(""),
        basis: z.string().min(2),
        amountCents: z.number().int().min(0),
        minimumCents: z.number().int().min(0).nullable().optional(),
        capCents: z.number().int().min(0).nullable().optional(),
        billedToClient: z.boolean().optional().default(true),
        note: z.string().optional().default(""),
        sortOrder: z.number().int().optional().default(0),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await requireAuthority(context);
    const agreement = await loadAgreement(context, data.agreementId);
    if (["active", "expired", "terminated"].includes(String(agreement.status))) {
      throw new Error("Prices on a live or closed agreement cannot be changed. Raise a new one.");
    }
    const row = {
      agreement_id: data.agreementId,
      label: data.label.trim(),
      description: data.description.trim() || null,
      basis: data.basis,
      amount_cents: data.amountCents,
      minimum_cents: data.minimumCents ?? null,
      cap_cents: data.capCents ?? null,
      billed_to_client: data.billedToClient,
      note: data.note.trim() || null,
      sort_order: data.sortOrder,
    };
    if (data.id) {
      const { error } = await context.supabase
        .from("provider_agreement_rates")
        .update(row)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase.from("provider_agreement_rates").insert(row);
      if (error) throw new Error(error.message);
    }
    await audit(context, who, {
      action: data.id ? "price changed" : "price added",
      target: `${agreement.title} — ${row.label}`,
      next: row,
    });
    return { ok: true };
  });

/** Remove a price line from a draft agreement. */
export const removeAgreementRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const who = await requireAuthority(context);
    const { data: rate } = await context.supabase
      .from("provider_agreement_rates")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!rate) throw new Error("That price line is not available.");
    const agreement = await loadAgreement(context, (rate as any).agreement_id);
    if (["active", "expired", "terminated"].includes(String(agreement.status))) {
      throw new Error("Prices on a live or closed agreement cannot be removed.");
    }
    const { error } = await context.supabase
      .from("provider_agreement_rates")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(context, who, {
      action: "price removed",
      target: `${agreement.title} — ${(rate as any).label}`,
      previous: rate,
    });
    return { ok: true };
  });

/** Add or change a condition that must be satisfied before the agreement goes live. */
export const saveAgreementCondition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        agreementId: z.string().uuid(),
        label: z.string().min(2),
        detail: z.string().optional().default(""),
        required: z.boolean().optional().default(true),
        evidenceUrl: z.string().optional().default(""),
        sortOrder: z.number().int().optional().default(0),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await requireAuthority(context);
    const agreement = await loadAgreement(context, data.agreementId);
    if (["expired", "terminated"].includes(String(agreement.status))) {
      throw new Error("A closed agreement can no longer be changed.");
    }
    const row = {
      agreement_id: data.agreementId,
      label: data.label.trim(),
      detail: data.detail.trim() || null,
      required: data.required,
      evidence_url: data.evidenceUrl.trim() || null,
      sort_order: data.sortOrder,
    };
    if (data.id) {
      const { error } = await context.supabase
        .from("provider_agreement_conditions")
        .update(row)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase.from("provider_agreement_conditions").insert(row);
      if (error) throw new Error(error.message);
    }
    await audit(context, who, {
      action: data.id ? "condition changed" : "condition added",
      target: `${agreement.title} — ${row.label}`,
      next: row,
    });
    return { ok: true };
  });

/** Mark a condition as satisfied, or put it back outstanding. */
export const setConditionMet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), met: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await requireAuthority(context);
    const { data: condition } = await context.supabase
      .from("provider_agreement_conditions")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!condition) throw new Error("That condition is not available.");
    const { error } = await context.supabase
      .from("provider_agreement_conditions")
      .update({
        met: data.met,
        confirmed_by: data.met ? who.userId : null,
        confirmed_at: data.met ? new Date().toISOString() : null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(context, who, {
      action: data.met ? "condition cleared" : "condition reopened",
      target: (condition as any).label,
      previous: { met: (condition as any).met },
      next: { met: data.met },
    });
    return { ok: true };
  });

/** Remove a condition from an agreement that is not yet live. */
export const removeAgreementCondition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const who = await requireAuthority(context);
    const { data: condition } = await context.supabase
      .from("provider_agreement_conditions")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!condition) throw new Error("That condition is not available.");
    const agreement = await loadAgreement(context, (condition as any).agreement_id);
    if (agreement.status === "active") {
      throw new Error("Conditions on a live agreement cannot be removed.");
    }
    const { error } = await context.supabase
      .from("provider_agreement_conditions")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(context, who, {
      action: "condition removed",
      target: `${agreement.title} — ${(condition as any).label}`,
      previous: condition,
    });
    return { ok: true };
  });

/** Move an agreement through review, signature, activation and termination. */
export const advanceProviderAgreement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        action: z.enum(["send_for_review", "back_to_draft", "sign", "activate", "terminate", "expire"]),
        providerSignerName: z.string().optional().default(""),
        providerSignerTitle: z.string().optional().default(""),
        harmoniousSignerName: z.string().optional().default(""),
        harmoniousSignerTitle: z.string().optional().default(""),
        reason: z.string().optional().default(""),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const who = await requireAuthority(context);
    const agreement = await loadAgreement(context, data.id);
    const status = String(agreement.status);
    const now = new Date().toISOString();
    let patch: Record<string, unknown> = {};

    if (data.action === "send_for_review") {
      if (status !== "draft") throw new Error("Only a draft can be sent for review.");
      patch = { status: "in_review" };
    } else if (data.action === "back_to_draft") {
      if (!["in_review", "signed"].includes(status)) {
        throw new Error("Only an agreement in review or signed can go back to draft.");
      }
      patch = {
        status: "draft",
        provider_signed_at: null,
        harmonious_signed_at: null,
        provider_signer_name: null,
        harmonious_signer_name: null,
      };
    } else if (data.action === "sign") {
      if (status !== "in_review") throw new Error("Send the agreement for review before signing.");
      if (!data.providerSignerName.trim() || !data.harmoniousSignerName.trim()) {
        throw new Error("Record who signed for the provider and for Harmonious.");
      }
      patch = {
        status: "signed",
        provider_signer_name: data.providerSignerName.trim(),
        provider_signer_title: data.providerSignerTitle.trim() || null,
        provider_signed_at: now,
        harmonious_signer_name: data.harmoniousSignerName.trim(),
        harmonious_signer_title: data.harmoniousSignerTitle.trim() || null,
        harmonious_signed_at: now,
      };
    } else if (data.action === "activate") {
      if (status !== "signed") throw new Error("Only a signed agreement can be activated.");
      const [{ data: rates }, { data: conditions }, { data: live }] = await Promise.all([
        context.supabase.from("provider_agreement_rates").select("id").eq("agreement_id", data.id),
        context.supabase
          .from("provider_agreement_conditions")
          .select("label, required, met")
          .eq("agreement_id", data.id),
        context.supabase
          .from("provider_agreements")
          .select("id, title")
          .eq("provider_id", agreement.provider_id)
          .eq("status", "active")
          .maybeSingle(),
      ]);
      if (!(rates ?? []).length) throw new Error("Add at least one agreed price before activating.");
      const outstanding = ((conditions ?? []) as any[]).filter((c) => c.required && !c.met);
      if (outstanding.length) {
        throw new Error(
          `These conditions are still outstanding: ${outstanding.map((c) => c.label).join(", ")}.`,
        );
      }
      if (live) throw new Error("This provider already has a live agreement. Close it first.");
      patch = {
        status: "active",
        activated_by: who.userId,
        activated_at: now,
        start_date: agreement.start_date ?? now.slice(0, 10),
      };
    } else if (data.action === "expire") {
      if (status !== "active") throw new Error("Only a live agreement can be marked expired.");
      patch = { status: "expired", terminated_at: now, termination_reason: "Term ended" };
    } else {
      if (!["signed", "active"].includes(status)) {
        throw new Error("Only a signed or live agreement can be terminated.");
      }
      if (!data.reason.trim()) throw new Error("Say why the agreement is being terminated.");
      patch = {
        status: "terminated",
        terminated_at: now,
        termination_reason: data.reason.trim(),
      };
    }

    const { error } = await context.supabase
      .from("provider_agreements")
      .update(patch as any)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(context, who, {
      action: String(patch['status']),
      target: agreement.title,
      previous: { status },
      next: patch,
    });
    return { ok: true };
  });
