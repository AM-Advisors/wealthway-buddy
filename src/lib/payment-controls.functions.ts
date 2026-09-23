import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertFundConditions } from "@/lib/fund-conditions.functions";
import { assertNoHold } from "@/lib/compliance-holds.functions";
import { NO_SCOPE_MESSAGE } from "@/lib/fund-conditions.functions";

export const OUT_OF_SCOPE_MESSAGE =
  "This service is not currently included in your active scope. Request service.";

/** Catalog services that cover each kind of movement. */
export function scopeKeysForPurpose(purpose: string) {
  if (purpose === "distribution" || purpose === "return_of_capital") return ["distributions"];
  return ["wire_instructions", "payment_facilitation"];
}

/**
 * Money only moves for work inside the client's active statement of work.
 * A fund with no client, and so no agreement, is stopped by the conditions
 * check instead.
 */
async function assertServiceInScope(
  supabase: any,
  opts: { offeringId?: string | null; clientId?: string | null; purpose: string },
) {
  let clientId = opts.clientId ?? null;
  if (!clientId && opts.offeringId) {
    const { data: fund } = await supabase
      .from("offerings")
      .select("client_id")
      .eq("id", opts.offeringId)
      .maybeSingle();
    clientId = (fund as any)?.client_id ?? null;
  }
  if (!clientId) return;

  const { data: rows } = await supabase
    .from("service_entitlements")
    .select("service_key, status, offering_id")
    .eq("client_id", clientId);
  const all = (rows ?? []) as any[];
  if (!all.length) throw new Error(NO_SCOPE_MESSAGE);

  const relevant = all.filter(
    (r) => !r.offering_id || !opts.offeringId || r.offering_id === opts.offeringId,
  );
  const keys = scopeKeysForPurpose(opts.purpose);
  const included = relevant.some((r) => keys.includes(r.service_key) && r.status === "included");
  if (!included) throw new Error(OUT_OF_SCOPE_MESSAGE);
}

const STAFF = [
  "admin",
  "super_admin",
  "operations",
  "compliance",
  "fund_administration",
  "finance",
  "executive",
  "legal",
  "client_success",
  "tax",
];

/** Roles allowed to authorise a movement of money. */
const APPROVERS = ["admin", "super_admin", "finance", "operations", "compliance", "executive"];

export const PAYMENT_PURPOSES = [
  { value: "distribution", label: "Distribution to investors" },
  { value: "expense", label: "Fund expense" },
  { value: "fee", label: "Harmonious fee (authorised)" },
  { value: "return_of_capital", label: "Return of capital" },
  { value: "transfer", label: "Transfer between accounts" },
  { value: "other", label: "Other" },
] as const;

async function rolesOf(context: any) {
  const { data } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  return ((data ?? []) as any[]).map((r) => String(r.role));
}

async function requireStaff(context: any) {
  const roles = await rolesOf(context);
  if (!roles.some((r) => STAFF.includes(r))) {
    throw new Error("Forbidden: payment controls are for the Harmonious team.");
  }
  return roles;
}

async function log(context: any, roles: string[], entry: Record<string, unknown>) {
  await context.supabase.from("contract_audit_events").insert({
    actor_id: context.userId,
    actor_role: roles.join(", "),
    area: "payment",
    source: "web",
    ...entry,
  });
}

export const listPaymentInstructions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ offeringId: z.string().uuid().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const roles = await rolesOf(context);
    let query = context.supabase
      .from("payment_instructions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.offeringId) query = query.eq("offering_id", data.offeringId);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const ids = (rows ?? []).map((r: any) => r.id);
    const [{ data: approvals }, { data: funds }] = await Promise.all([
      ids.length
        ? context.supabase.from("payment_approvals").select("*").in("instruction_id", ids)
        : Promise.resolve({ data: [] as any[] }),
      context.supabase.from("offerings").select("id, name"),
    ]);

    const invoiceIds = (rows ?? []).map((r: any) => r.invoice_id).filter(Boolean);
    const { data: invoices } = invoiceIds.length
      ? await context.supabase.from("invoices").select("id, number, total_cents, client_id").in("id", invoiceIds)
      : { data: [] as any[] };
    const { data: clients } = await context.supabase.from("clients").select("id, name");

    return {
      canApprove: roles.some((r) => APPROVERS.includes(r)),
      instructions: (rows ?? []).map((r: any) => {
        const mine = (approvals ?? []).filter((a: any) => a.instruction_id === r.id);
        return {
          ...r,
          fundName: (funds ?? []).find((f: any) => f.id === r.offering_id)?.name ?? null,
          clientName: (clients ?? []).find((c: any) => c.id === r.client_id)?.name ?? null,
          invoiceNumber: (invoices ?? []).find((i: any) => i.id === r.invoice_id)?.number ?? null,
          approvals: mine,
          approvalCount: mine.filter((a: any) => a.decision === "approved").length,
        };
      }),
    };
  });

export const createPaymentInstruction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        offeringId: z.string().uuid().nullable().optional(),
        clientId: z.string().uuid().nullable().optional(),
        direction: z.enum(["inbound", "outbound"]).default("outbound"),
        purpose: z.string().min(2).max(60),
        amountCents: z.number().int().positive(),
        originatingAccount: z.string().max(160).optional().or(z.literal("")),
        beneficiaryName: z.string().max(160).optional().or(z.literal("")),
        beneficiaryAccount: z.string().max(160).optional().or(z.literal("")),
        supportingDocumentPath: z.string().max(500).optional().or(z.literal("")),
        authorizationReference: z.string().max(300).optional().or(z.literal("")),
        callbackRequired: z.boolean().default(true),
        note: z.string().max(2000).optional().or(z.literal("")),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const roles = await requireStaff(context);

    await assertNoHold(context.supabase, "wires", {
      offeringId: data.offeringId ?? null,
      clientId: data.clientId ?? null,
    });
    await assertServiceInScope(context.supabase, {
      offeringId: data.offeringId ?? null,
      clientId: data.clientId ?? null,
      purpose: data.purpose,
    });
    if (data.offeringId) {
      await assertFundConditions(context.supabase, data.offeringId, "funding");
    }

    if (data.purpose === "fee" && !data.authorizationReference) {
      throw new Error(
        "A fee payment needs the written client authorisation reference before it can be raised.",
      );
    }

    const { data: created, error } = await context.supabase
      .from("payment_instructions")
      .insert({
        offering_id: data.offeringId ?? null,
        client_id: data.clientId ?? null,
        direction: data.direction,
        purpose: data.purpose,
        amount_cents: data.amountCents,
        originating_account: data.originatingAccount || null,
        beneficiary_name: data.beneficiaryName || null,
        beneficiary_account: data.beneficiaryAccount || null,
        supporting_document_path: data.supportingDocumentPath || null,
        authorization_reference: data.authorizationReference || null,
        callback_status: data.callbackRequired ? "pending" : "not_required",
        requested_by: context.userId,
        status: "awaiting_approval",
        note: data.note || null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await log(context, roles, {
      action: "instruction raised",
      offering_id: data.offeringId ?? null,
      client_id: data.clientId ?? null,
      target: created.id,
      new_value: { amount_cents: data.amountCents, purpose: data.purpose } as any,
    });
    return { id: created.id as string };
  });

export const updatePaymentChecks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        verificationStatus: z.enum(["pending", "verified", "failed"]).optional(),
        callbackStatus: z.enum(["not_required", "pending", "completed", "failed"]).optional(),
        complianceStatus: z.enum(["pending", "cleared", "escalated"]).optional(),
        bankStatus: z.enum(["not_sent", "sent", "returned", "rejected"]).optional(),
        callbackNote: z.string().max(500).optional().or(z.literal("")),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const roles = await requireStaff(context);
    const patch: Record<string, unknown> = {};
    if (data.verificationStatus) patch["verification_status"] = data.verificationStatus;
    if (data.callbackStatus) patch["callback_status"] = data.callbackStatus;
    if (data.complianceStatus) patch["compliance_status"] = data.complianceStatus;
    if (data.bankStatus) patch["bank_status"] = data.bankStatus;
    if (data.callbackNote !== undefined) patch["callback_note"] = data.callbackNote || null;

    const { error } = await context.supabase
      .from("payment_instructions")
      .update(patch as any)
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    // D1: settlement is never typed in. A legacy instruction cannot be marked
    // settled, cannot create a fund distribution and cannot mark an invoice
    // paid from here; those follow bank reconciliation and posted accounting.

    await log(context, roles, { action: "checks updated", target: data.id, new_value: patch as any });
    return { ok: true };
  });

export const decidePaymentInstruction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        decision: z.enum(["approved", "paused", "rejected"]),
        note: z.string().max(1000).optional().or(z.literal("")),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const roles = await requireStaff(context);
    const canApprove = roles.some((r) => APPROVERS.includes(r));
    if (data.decision === "approved" && !canApprove) {
      throw new Error("Forbidden: your role cannot authorise a movement of money.");
    }

    const { data: instruction } = await context.supabase
      .from("payment_instructions")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!instruction) throw new Error("That instruction isn't available.");
    if (instruction.requested_by === context.userId && data.decision === "approved") {
      throw new Error("The person who raised an instruction cannot also approve it.");
    }

    if (data.decision === "approved") {
      if (instruction.verification_status !== "verified") {
        throw new Error("Verify the beneficiary details before approving.");
      }
      if (instruction.callback_status === "pending") {
        throw new Error("Complete the callback check before approving.");
      }
      if (instruction.compliance_status !== "cleared") {
        throw new Error("Compliance must clear this instruction before approval.");
      }
      await assertNoHold(context.supabase, "wires", {
        offeringId: instruction.offering_id,
        clientId: instruction.client_id,
      });
      await assertServiceInScope(context.supabase, {
        offeringId: instruction.offering_id,
        clientId: instruction.client_id,
        purpose: String(instruction.purpose ?? ""),
      });
      if (instruction.offering_id) {
        await assertFundConditions(context.supabase, instruction.offering_id, "funding");
      }

      const { error: approvalError } = await context.supabase.from("payment_approvals").insert({
        instruction_id: data.id,
        approver_id: context.userId,
        approver_role: roles.join(", "),
        decision: "approved",
        note: data.note || null,
      });
      if (approvalError && !approvalError.message.includes("duplicate")) {
        throw new Error(approvalError.message);
      }

      const { data: approvals } = await context.supabase
        .from("payment_approvals")
        .select("id, decision")
        .eq("instruction_id", data.id);
      const count = (approvals ?? []).filter((a: any) => a.decision === "approved").length;
      const needed = instruction.dual_approval_required ? 2 : 1;
      const status = count >= needed ? "approved" : "awaiting_approval";
      await context.supabase.from("payment_instructions").update({ status }).eq("id", data.id);

      await log(context, roles, {
        action: `approval ${count}/${needed}`,
        target: data.id,
        offering_id: instruction.offering_id,
        client_id: instruction.client_id,
        approval: `${count} of ${needed}`,
      });
      return { status, approvals: count, needed };
    }

    if (!data.note) throw new Error("Give the reason for pausing or rejecting this instruction.");
    await context.supabase
      .from("payment_instructions")
      .update({ status: data.decision, pause_reason: data.note })
      .eq("id", data.id);
    await context.supabase.from("payment_approvals").insert({
      instruction_id: data.id,
      approver_id: context.userId,
      approver_role: roles.join(", "),
      decision: data.decision,
      note: data.note,
    });
    await log(context, roles, {
      action: data.decision,
      target: data.id,
      offering_id: instruction.offering_id,
      client_id: instruction.client_id,
      new_value: { reason: data.note } as any,
    });
    return { status: data.decision, approvals: 0, needed: 0 };
  });

/** A short-lived link to the paperwork behind one payment, for the team only. */
export const getPaymentDocumentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStaff(context);
    const { data: instruction } = await context.supabase
      .from("payment_instructions")
      .select("supporting_document_path")
      .eq("id", data.id)
      .maybeSingle();
    const path = (instruction as any)?.supporting_document_path as string | null;
    if (!path) throw new Error("No supporting document is attached to this payment.");
    const { data: signed, error } = await context.supabase.storage
      .from("payment-documents")
      .createSignedUrl(path, 300);
    if (error) throw new Error(error.message);
    return { url: signed?.signedUrl as string };
  });

/** Funds and clients a movement can be raised against. */
export const getMoneyMovementOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await requireStaff(context);
    const [{ data: funds }, { data: clients }] = await Promise.all([
      context.supabase.from("offerings").select("id, name, client_id").order("name"),
      context.supabase.from("clients").select("id, name").order("name"),
    ]);
    return {
      funds: (funds ?? []) as any[],
      clients: (clients ?? []) as any[],
      canApprove: roles.some((r) => APPROVERS.includes(r)),
    };
  });
