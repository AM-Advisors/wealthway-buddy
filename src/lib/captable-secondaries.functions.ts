import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Harmonious CapTable — Phase 4: secondary transfers.
 *
 * A shareholder sale moves through named stages: request, transfer restriction
 * review, right of first refusal, company consent, then closing. Each stage is
 * owned, dated and written to the company's history. A request never changes
 * the official ledger on its own — only a deliberate close posts the transfer
 * transactions the cap table is derived from.
 */

export const TRANSFER_STAGES = [
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Submitted" },
  { value: "restriction_review", label: "Restriction review" },
  { value: "rofr", label: "Right of first refusal" },
  { value: "consent", label: "Company consent" },
  { value: "approved", label: "Approved" },
  { value: "closed", label: "Closed to the ledger" },
  { value: "rejected", label: "Rejected" },
  { value: "withdrawn", label: "Withdrawn" },
] as const;

export const RESTRICTION_OUTCOMES = [
  { value: "not_started", label: "Not started" },
  { value: "clear", label: "No restriction blocks the sale" },
  { value: "conditions", label: "Permitted with conditions" },
  { value: "blocked", label: "Restricted — cannot proceed" },
] as const;

export const ROFR_OUTCOMES = [
  { value: "not_started", label: "Not started" },
  { value: "offered", label: "Offered — awaiting response" },
  { value: "waived", label: "Waived" },
  { value: "expired", label: "Expired unexercised" },
  { value: "exercised", label: "Exercised by the company" },
] as const;

export const CONSENT_OUTCOMES = [
  { value: "pending", label: "Pending" },
  { value: "granted", label: "Consent granted" },
  { value: "denied", label: "Consent denied" },
] as const;

function n(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function assertManage(context: any, companyId: string) {
  const { data } = await context.supabase.rpc("ct_can_manage", { _company_id: companyId });
  if (!data) throw new Error("You do not have authority to change this cap table.");
}

async function recordEvent(
  context: any,
  entry: {
    companyId: string;
    action: string;
    entityId?: string | null;
    previous?: unknown;
    next?: unknown;
    reason?: string | null;
  },
) {
  await context.supabase.from("ct_events").insert({
    company_id: entry.companyId,
    actor_id: context.userId,
    action: entry.action,
    entity_type: "secondary_transfer",
    entity_id: entry.entityId ?? null,
    previous_state: (entry.previous ?? null) as any,
    new_state: (entry.next ?? null) as any,
    reason: entry.reason ?? null,
  });
}

/** Current balance of a security, derived from its transaction history. */
async function securityBalance(context: any, companyId: string, securityId: string) {
  const { data: security } = await context.supabase
    .from("ct_securities")
    .select("*")
    .eq("id", securityId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!security) throw new Error("That holding no longer exists.");

  const { data: txs } = await context.supabase
    .from("ct_transactions")
    .select("quantity, status")
    .eq("company_id", companyId)
    .eq("security_id", securityId);

  const live = ((txs ?? []) as any[]).filter(
    (t) => t.status !== "rejected" && t.status !== "pending",
  );
  const balance = live.length
    ? live.reduce((sum, t) => sum + n(t.quantity), 0)
    : n((security as any).quantity);

  return { security: security as any, balance, hasHistory: live.length > 0 };
}

/* -------------------------------------------------------------------- read */

export const getCapSecondaries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ companyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const companyId = data.companyId;

    const [
      { data: transfers },
      { data: stakeholders },
      { data: securities },
      { data: transactions },
      { data: documents },
      { data: allowed },
    ] = await Promise.all([
      context.supabase
        .from("ct_secondary_transfers")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false }),
      context.supabase
        .from("ct_stakeholders")
        .select("id, name, stakeholder_type, email")
        .eq("company_id", companyId)
        .order("name"),
      context.supabase
        .from("ct_securities")
        .select("id, stakeholder_id, class_id, security_type, label, quantity, transfer_restrictions")
        .eq("company_id", companyId),
      context.supabase
        .from("ct_transactions")
        .select("security_id, quantity, status")
        .eq("company_id", companyId),
      context.supabase
        .from("ct_documents")
        .select("id, title, doc_type, status, linked_id, created_at")
        .eq("company_id", companyId)
        .eq("linked_type", "secondary_transfer")
        .order("created_at", { ascending: false }),
      context.supabase.rpc("ct_can_manage", { _company_id: companyId }),
    ]);

    const balances = new Map<string, number>();
    for (const tx of (transactions ?? []) as any[]) {
      if (!tx.security_id) continue;
      if (tx.status === "rejected" || tx.status === "pending") continue;
      balances.set(tx.security_id, (balances.get(tx.security_id) ?? 0) + n(tx.quantity));
    }

    const holderById = new Map(((stakeholders ?? []) as any[]).map((s) => [s.id, s]));

    const holdings = ((securities ?? []) as any[])
      .map((s) => ({
        id: s.id as string,
        stakeholderId: s.stakeholder_id as string,
        stakeholder: (holderById.get(s.stakeholder_id) as any)?.name ?? "Unknown holder",
        classId: s.class_id as string | null,
        securityType: s.security_type as string,
        label: s.label as string | null,
        restrictions: s.transfer_restrictions as string | null,
        quantity: balances.has(s.id) ? balances.get(s.id)! : n(s.quantity),
      }))
      .filter((s) => s.quantity > 0);

    const docsByTransfer = new Map<string, any[]>();
    for (const d of (documents ?? []) as any[]) {
      const key = String(d.linked_id ?? "");
      docsByTransfer.set(key, [...(docsByTransfer.get(key) ?? []), d]);
    }

    const rows = ((transfers ?? []) as any[]).map((t) => {
      const holding = holdings.find((h) => h.id === t.security_id);
      return {
        id: t.id as string,
        securityId: t.security_id as string | null,
        holdingLabel: holding
          ? `${holding.label ?? holding.securityType} · ${holding.quantity.toLocaleString("en-US")} held`
          : null,
        holdingAvailable: holding?.quantity ?? null,
        sellerId: t.seller_stakeholder_id as string,
        seller: (holderById.get(t.seller_stakeholder_id) as any)?.name ?? "Unknown seller",
        buyerId: t.buyer_stakeholder_id as string | null,
        buyer:
          (t.buyer_stakeholder_id
            ? (holderById.get(t.buyer_stakeholder_id) as any)?.name
            : t.buyer_name) ?? "Buyer to be named",
        buyerEmail: t.buyer_email as string | null,
        buyerType: t.buyer_type as string | null,
        quantity: n(t.quantity),
        pricePerShare: t.price_per_share === null ? null : n(t.price_per_share),
        amount: t.amount === null ? null : n(t.amount),
        status: t.status as string,
        requestedOn: t.requested_on as string | null,
        restrictionStatus: t.restriction_status as string,
        restrictionNote: t.restriction_note as string | null,
        rofrStatus: t.rofr_status as string,
        rofrDeadline: t.rofr_deadline as string | null,
        rofrNote: t.rofr_note as string | null,
        consentStatus: t.consent_status as string,
        consentNote: t.consent_note as string | null,
        consentDecidedAt: t.consent_decided_at as string | null,
        closingDate: t.closing_date as string | null,
        closedAt: t.closed_at as string | null,
        buyerSecurityId: t.buyer_security_id as string | null,
        notes: t.notes as string | null,
        documents: (docsByTransfer.get(String(t.id)) ?? []).map((d) => ({
          id: d.id as string,
          title: d.title as string,
          docType: d.doc_type as string,
          status: d.status as string,
          createdAt: d.created_at as string,
        })),
      };
    });

    const open = rows.filter(
      (r) => !["closed", "rejected", "withdrawn"].includes(r.status),
    );

    return {
      canManage: Boolean(allowed),
      transfers: rows,
      holdings,
      stakeholders: ((stakeholders ?? []) as any[]).map((s) => ({
        id: s.id as string,
        name: s.name as string,
        type: s.stakeholder_type as string,
      })),
      totals: {
        open: open.length,
        awaitingConsent: rows.filter((r) => r.status === "consent").length,
        inRofr: rows.filter((r) => r.status === "rofr").length,
        closed: rows.filter((r) => r.status === "closed").length,
        sharesInFlight: open.reduce((sum, r) => sum + r.quantity, 0),
        valueInFlight: open.reduce((sum, r) => sum + (r.amount ?? 0), 0),
      },
    };
  });

/* ------------------------------------------------------------------ writes */

export const saveSecondaryTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        id: z.string().uuid().optional().nullable(),
        securityId: z.string().uuid(),
        sellerStakeholderId: z.string().uuid(),
        buyerStakeholderId: z.string().uuid().optional().nullable(),
        buyerName: z.string().trim().max(160).optional().nullable(),
        buyerEmail: z.string().trim().email().max(200).optional().nullable().or(z.literal("")),
        buyerType: z.string().trim().max(40).optional().nullable(),
        quantity: z.number().positive(),
        pricePerShare: z.number().nonnegative().optional().nullable(),
        requestedOn: z.string().trim().optional().nullable(),
        notes: z.string().trim().max(2000).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertManage(context, data.companyId);
    if (!data.buyerStakeholderId && !data.buyerName) {
      throw new Error("Name the buyer, or choose an existing shareholder.");
    }

    const { balance, security } = await securityBalance(context, data.companyId, data.securityId);
    if (String(security.stakeholder_id) !== data.sellerStakeholderId) {
      throw new Error("That holding does not belong to the seller you chose.");
    }
    if (data.quantity > balance) {
      throw new Error(
        `The seller holds ${balance.toLocaleString("en-US")} of this security — you cannot transfer more.`,
      );
    }

    const payload = {
      company_id: data.companyId,
      security_id: data.securityId,
      seller_stakeholder_id: data.sellerStakeholderId,
      buyer_stakeholder_id: data.buyerStakeholderId || null,
      buyer_name: data.buyerName || null,
      buyer_email: data.buyerEmail || null,
      buyer_type: data.buyerType || null,
      quantity: data.quantity,
      price_per_share: data.pricePerShare ?? null,
      amount: data.pricePerShare ? data.pricePerShare * data.quantity : null,
      requested_on: data.requestedOn || new Date().toISOString().slice(0, 10),
      notes: data.notes || null,
      created_by: context.userId,
    };

    if (data.id) {
      const { data: existing } = await context.supabase
        .from("ct_secondary_transfers")
        .select("status")
        .eq("id", data.id)
        .eq("company_id", data.companyId)
        .maybeSingle();
      if (!existing) throw new Error("That transfer request no longer exists.");
      if (String((existing as any).status) === "closed") {
        throw new Error("This transfer is on the ledger and can no longer be edited.");
      }
    }

    const query = data.id
      ? context.supabase
          .from("ct_secondary_transfers")
          .update(payload)
          .eq("id", data.id)
          .eq("company_id", data.companyId)
      : context.supabase.from("ct_secondary_transfers").insert({ ...payload, status: "submitted" });

    const { data: row, error } = await query.select("id").single();
    if (error) throw new Error(error.message);

    await recordEvent(context, {
      companyId: data.companyId,
      action: data.id ? "transfer.updated" : "transfer.requested",
      entityId: row.id,
      next: payload,
    });
    return { id: row.id as string };
  });

/** Records the transfer-restriction review outcome. */
export const reviewTransferRestrictions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        id: z.string().uuid(),
        outcome: z.enum(["clear", "conditions", "blocked"]),
        note: z.string().trim().max(1000).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertManage(context, data.companyId);
    const patch = {
      restriction_status: data.outcome,
      restriction_note: data.note || null,
      restriction_reviewed_at: new Date().toISOString(),
      restriction_reviewed_by: context.userId,
      status: data.outcome === "blocked" ? "rejected" : "rofr",
    };
    const { error } = await context.supabase
      .from("ct_secondary_transfers")
      .update(patch)
      .eq("id", data.id)
      .eq("company_id", data.companyId)
      .neq("status", "closed");
    if (error) throw new Error(error.message);

    await recordEvent(context, {
      companyId: data.companyId,
      action: "transfer.restrictions_reviewed",
      entityId: data.id,
      next: patch,
      reason: data.note ?? null,
    });
    return { ok: true };
  });

/** Records the right of first refusal outcome. */
export const recordRofrDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        id: z.string().uuid(),
        outcome: z.enum(["offered", "waived", "expired", "exercised"]),
        deadline: z.string().trim().optional().nullable(),
        note: z.string().trim().max(1000).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertManage(context, data.companyId);
    const nextStatus =
      data.outcome === "offered" ? "rofr" : data.outcome === "exercised" ? "rejected" : "consent";
    const patch = {
      rofr_status: data.outcome,
      rofr_deadline: data.deadline || null,
      rofr_note: data.note || null,
      rofr_decided_at: new Date().toISOString(),
      rofr_decided_by: context.userId,
      status: nextStatus,
    };
    const { error } = await context.supabase
      .from("ct_secondary_transfers")
      .update(patch)
      .eq("id", data.id)
      .eq("company_id", data.companyId)
      .neq("status", "closed");
    if (error) throw new Error(error.message);

    await recordEvent(context, {
      companyId: data.companyId,
      action: "transfer.rofr_recorded",
      entityId: data.id,
      next: patch,
      reason: data.note ?? null,
    });
    return { ok: true };
  });

/** Records the company's consent decision. */
export const recordTransferConsent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        id: z.string().uuid(),
        decision: z.enum(["granted", "denied"]),
        note: z.string().trim().min(3).max(1000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertManage(context, data.companyId);
    const patch = {
      consent_status: data.decision,
      consent_note: data.note,
      consent_decided_at: new Date().toISOString(),
      consent_decided_by: context.userId,
      status: data.decision === "granted" ? "approved" : "rejected",
    };
    const { error } = await context.supabase
      .from("ct_secondary_transfers")
      .update(patch)
      .eq("id", data.id)
      .eq("company_id", data.companyId)
      .neq("status", "closed");
    if (error) throw new Error(error.message);

    await recordEvent(context, {
      companyId: data.companyId,
      action: "transfer.consent_recorded",
      entityId: data.id,
      next: patch,
      reason: data.note,
    });
    return { ok: true };
  });

export const withdrawSecondaryTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        id: z.string().uuid(),
        reason: z.string().trim().min(3).max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertManage(context, data.companyId);
    const { error } = await context.supabase
      .from("ct_secondary_transfers")
      .update({ status: "withdrawn", notes: data.reason })
      .eq("id", data.id)
      .eq("company_id", data.companyId)
      .neq("status", "closed");
    if (error) throw new Error(error.message);

    await recordEvent(context, {
      companyId: data.companyId,
      action: "transfer.withdrawn",
      entityId: data.id,
      reason: data.reason,
    });
    return { ok: true };
  });

/** Records a signed document against the transfer file. */
export const addTransferDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        transferId: z.string().uuid(),
        title: z.string().trim().min(2).max(200),
        docType: z.string().trim().min(2).max(60).default("transfer_agreement"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertManage(context, data.companyId);
    const { data: row, error } = await context.supabase
      .from("ct_documents")
      .insert({
        company_id: data.companyId,
        title: data.title,
        doc_type: data.docType,
        linked_type: "secondary_transfer",
        linked_id: data.transferId,
        status: "recorded",
        uploaded_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await recordEvent(context, {
      companyId: data.companyId,
      action: "transfer.document_recorded",
      entityId: data.transferId,
      next: { documentId: row.id, title: data.title, docType: data.docType },
    });
    return { id: row.id as string };
  });

/**
 * Closes an approved transfer: posts the seller's outgoing transaction, issues
 * the buyer's security and posts the incoming transaction. This is the only
 * step that changes the official cap table.
 */
export const closeSecondaryTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        id: z.string().uuid(),
        closingDate: z.string().trim().min(4),
        reason: z.string().trim().min(3).max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertManage(context, data.companyId);

    const { data: transfer } = await context.supabase
      .from("ct_secondary_transfers")
      .select("*")
      .eq("id", data.id)
      .eq("company_id", data.companyId)
      .maybeSingle();
    if (!transfer) throw new Error("That transfer request no longer exists.");
    const t = transfer as any;
    if (t.status === "closed") throw new Error("This transfer is already on the ledger.");
    if (t.status !== "approved" || t.consent_status !== "granted") {
      throw new Error("Company consent must be granted before a transfer can close.");
    }
    if (t.restriction_status === "blocked") {
      throw new Error("A transfer restriction blocks this sale.");
    }
    if (!["waived", "expired"].includes(String(t.rofr_status))) {
      throw new Error("Record the right of first refusal as waived or expired before closing.");
    }
    if (!t.security_id) throw new Error("This request is not linked to a holding.");

    const quantity = n(t.quantity);
    const { security, balance, hasHistory } = await securityBalance(
      context,
      data.companyId,
      String(t.security_id),
    );
    if (quantity <= 0 || quantity > balance) {
      throw new Error(
        `The seller now holds ${balance.toLocaleString("en-US")} of this security — the transfer cannot close.`,
      );
    }

    // A security with no history yet needs its opening position on the ledger
    // first, so the derived balance stays correct after the transfer out.
    if (!hasHistory) {
      const { error } = await context.supabase.from("ct_transactions").insert({
        company_id: data.companyId,
        security_id: security.id,
        stakeholder_id: security.stakeholder_id,
        kind: "issuance",
        quantity: n(security.quantity),
        effective_date: security.issue_date ?? data.closingDate,
        status: "recorded",
        reason: "Opening position recorded before secondary transfer",
        created_by: context.userId,
      });
      if (error) throw new Error(error.message);
    }

    let buyerStakeholderId = t.buyer_stakeholder_id as string | null;
    if (!buyerStakeholderId) {
      const { data: created, error } = await context.supabase
        .from("ct_stakeholders")
        .insert({
          company_id: data.companyId,
          name: t.buyer_name ?? "New buyer",
          email: t.buyer_email ?? null,
          stakeholder_type: t.buyer_type || "investor",
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      buyerStakeholderId = created.id as string;
      await context.supabase
        .from("ct_secondary_transfers")
        .update({ buyer_stakeholder_id: buyerStakeholderId })
        .eq("id", data.id);
    }

    const price = t.price_per_share === null ? null : n(t.price_per_share);
    const amount = t.amount === null ? (price ? price * quantity : null) : n(t.amount);

    const { data: buyerSecurity, error: secError } = await context.supabase
      .from("ct_securities")
      .insert({
        company_id: data.companyId,
        stakeholder_id: buyerStakeholderId,
        class_id: security.class_id ?? null,
        security_type: security.security_type,
        quantity,
        issue_date: data.closingDate,
        purchase_price: price,
        label: security.label ? `${security.label} (transferred)` : null,
        transfer_restrictions: security.transfer_restrictions ?? null,
        notes: `Acquired by secondary transfer from ${t.seller_stakeholder_id}`,
        status: "recorded",
        verification_status: "verified",
      })
      .select("id")
      .single();
    if (secError) throw new Error(secError.message);

    const { error: txError } = await context.supabase.from("ct_transactions").insert([
      {
        company_id: data.companyId,
        security_id: security.id,
        stakeholder_id: t.seller_stakeholder_id,
        counterparty_stakeholder_id: buyerStakeholderId,
        kind: "transfer",
        quantity: -quantity,
        amount,
        effective_date: data.closingDate,
        status: "recorded",
        reason: data.reason,
        created_by: context.userId,
        metadata: { transferId: data.id, direction: "out" } as any,
      },
      {
        company_id: data.companyId,
        security_id: buyerSecurity.id,
        stakeholder_id: buyerStakeholderId,
        counterparty_stakeholder_id: t.seller_stakeholder_id,
        kind: "transfer",
        quantity,
        amount,
        effective_date: data.closingDate,
        status: "recorded",
        reason: data.reason,
        created_by: context.userId,
        metadata: { transferId: data.id, direction: "in" } as any,
      },
    ]);
    if (txError) throw new Error(txError.message);

    const { error: updError } = await context.supabase
      .from("ct_secondary_transfers")
      .update({
        status: "closed",
        closing_date: data.closingDate,
        closed_at: new Date().toISOString(),
        buyer_security_id: buyerSecurity.id,
        buyer_stakeholder_id: buyerStakeholderId,
      })
      .eq("id", data.id)
      .eq("company_id", data.companyId);
    if (updError) throw new Error(updError.message);

    await recordEvent(context, {
      companyId: data.companyId,
      action: "transfer.closed",
      entityId: data.id,
      previous: { status: t.status },
      next: {
        status: "closed",
        quantity,
        buyerSecurityId: buyerSecurity.id,
        closingDate: data.closingDate,
      },
      reason: data.reason,
    });

    return { buyerSecurityId: buyerSecurity.id as string };
  });
