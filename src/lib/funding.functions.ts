import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { activeApplicationId } from "@/lib/active-application";

export const wireSentSchema = z.object({
  expected_date: z.string().trim().min(1, "Choose the date the wire was sent"),
  bank_last4: z.string().trim().regex(/^\d{4}$/, "Enter the last 4 digits of the sending account"),
});

export const wireConfirmationSchema = z.object({
  sent_on: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the date the wire was sent"),
  amount: z
    .string()
    .trim()
    .regex(/^\d{1,12}(\.\d{1,2})?$/, "Enter the amount you wired, for example 50000"),
  sending_bank_name: z.string().trim().min(2, "Enter the bank you wired from").max(160),
  sending_account_last4: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "Enter the last 4 digits of the sending account"),
  bank_reference: z.string().trim().max(120).optional().or(z.literal("")),
  investor_note: z.string().trim().max(1000).optional().or(z.literal("")),
  confirm_accurate: z.literal(true),
});

export const achSchema = z.object({
  account_holder: z.string().trim().min(2, "Enter the account holder name").max(120),
  routing_number: z.string().trim().regex(/^\d{9}$/, "Routing numbers are 9 digits"),
  account_number: z.string().trim().regex(/^\d{4,17}$/, "Enter a valid account number"),
  account_type: z.enum(["checking", "savings"]),
  authorize_debit: z.literal(true),
});

export const acknowledgeSchema = z.object({
  method: z.enum(["wire", "ach"]),
  statements: z.array(z.string().trim().min(3).max(400)).min(1).max(6),
});

function referenceCode(applicationId: string) {
  return `HAR-${applicationId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

async function sha256Hex(input: string) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Fingerprint of exactly what the investor must review, computed server-side only. */
async function instructionsFingerprint(
  supabase: any,
  application: { id: string; offering_id: string; commitment_cents: number | null },
  method: "wire" | "ach",
) {
  const base = {
    method,
    offering_id: application.offering_id,
    amount_cents: application.commitment_cents ?? 0,
    reference: referenceCode(application.id),
    instructions: {} as Record<string, string>,
  };

  if (method === "wire") {
    const { data: wireRow } = await supabase
      .rpc("get_wire_instructions", { p_offering_id: application.offering_id })
      .maybeSingle();
    const details = ((wireRow as any)?.details ?? {}) as Record<string, unknown>;
    base.instructions = Object.fromEntries(
      Object.keys(details)
        .sort()
        .map((k) => [k, String(details[k] ?? "")]),
    );
  }

  return sha256Hex(JSON.stringify(base));
}

async function latestAcknowledgement(
  supabase: any,
  applicationId: string,
  method: "wire" | "ach",
) {
  const { data } = await supabase
    .from("funding_acknowledgements")
    .select("id, method, instructions_hash, statements, acknowledged_at")
    .eq("application_id", applicationId)
    .eq("method", method)
    .order("acknowledged_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

async function assertAcknowledged(
  supabase: any,
  application: { id: string; offering_id: string; commitment_cents: number | null },
  method: "wire" | "ach",
) {
  const ack = await latestAcknowledgement(supabase, application.id, method);
  const expected = await instructionsFingerprint(supabase, application, method);
  if (!ack) {
    throw new Error("Review and confirm the funding instructions before continuing.");
  }
  if (ack.instructions_hash !== expected) {
    throw new Error(
      "The funding details for this fund have changed. Please review and confirm them again.",
    );
  }
  return ack;
}

async function loadFundingApplication(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("investor_applications")
    .select(
      "id, offering_id, kyc_status, aml_status, accreditation_status, documents_status, funding_status, commitment_cents, manager_review_status, manager_review_notes",
    )
    .eq("user_id", userId)
    .eq("id", await activeApplicationId(supabase, userId))
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("No application found.");
  return data;
}

function assertFundable(app: {
  kyc_status?: string;
  accreditation_status: string;
  documents_status: string;
  manager_review_status?: string | null;
}) {
  // The fund team has to approve the identity application first — nobody
  // reaches wire instructions on an unapproved file.
  if (app.kyc_status && app.kyc_status !== "approved") {
    throw new Error(
      "The fund team is still reviewing your identity application. Funding opens once it is approved.",
    );
  }
  if (app.documents_status !== "approved") {
    throw new Error("Sign all fund documents before funding your subscription.");
  }
  if (app.accreditation_status !== "approved") {
    throw new Error(
      "Your accredited investor status must be confirmed before the fund can accept capital.",
    );
  }
  // A fund manager signs off on the whole file before funding opens.
  if (app.manager_review_status && app.manager_review_status !== "approved") {
    throw new Error(
      app.manager_review_status === "declined"
        ? "Your fund manager sent your application back. Check your portal for what is needed."
        : "Your fund manager is completing a final review of your application. Funding opens once it is approved.",
    );
  }
}

export const getFunding = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: application } = await supabase
      .from("investor_applications")
      .select(
        "id, offering_id, kyc_status, aml_status, accreditation_status, documents_status, funding_status, commitment_cents, manager_review_status, manager_review_notes",
      )
      .eq("user_id", userId)
      .eq("id", await activeApplicationId(supabase, userId))
      .maybeSingle();

    if (!application)
      return {
        application: null,
        offering: null,
        payment: null,
        reference: null,
        acknowledgements: { wire: null, ach: null } as {
          wire: { acknowledged_at: string; statements: string[]; current: boolean } | null;
          ach: { acknowledged_at: string; statements: string[]; current: boolean } | null;
        },
        wireConfirmations: [] as any[],
      };

    const { data: offeringRow } = await supabase
      .from("offerings")
      .select("id, name, min_investment_cents, target_raise_cents")
      .eq("id", application.offering_id)
      .maybeSingle();

    const { data: wireRow } = await supabase
      .rpc("get_wire_instructions", { p_offering_id: application.offering_id })
      .maybeSingle();

    const offering = offeringRow
      ? { ...offeringRow, wire_instructions: ((wireRow as any)?.details ?? {}) as Record<string, string> }
      : null;

    const { data: payment } = await supabase
      .from("payments")
      .select("*")
      .eq("application_id", application.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    type AckInfo = { acknowledged_at: string; statements: string[]; current: boolean } | null;
    const acknowledgements: { wire: AckInfo; ach: AckInfo } = { wire: null, ach: null };
    for (const method of ["wire", "ach"] as const) {
      const ack = await latestAcknowledgement(supabase, application.id, method);
      const expected = await instructionsFingerprint(supabase, application as any, method);
      acknowledgements[method] = ack
        ? {
            acknowledged_at: String(ack.acknowledged_at),
            statements: (ack.statements ?? []) as string[],
            current: ack.instructions_hash === expected,
          }
        : null;
    }

    const { data: wireConfirmations } = await supabase
      .from("wire_confirmations")
      .select(
        "id, amount_cents, sent_on, sending_bank_name, sending_account_last4, bank_reference, investor_note, status, review_notes, reviewed_at, created_at",
      )
      .eq("application_id", application.id)
      .order("created_at", { ascending: false });

    return {
      application,
      offering,
      payment,
      acknowledgements,
      wireConfirmations: wireConfirmations ?? [],
      reference: referenceCode(application.id),
      fundProgress: await fundProgress(application.offering_id, offeringRow?.target_raise_cents ?? null),
    };
  });

/**
 * Fund-level capital picture for the offering this investor is in.
 * Reads across every application in the fund, so it runs with elevated
 * access after we have already confirmed the caller belongs to the fund.
 */
async function fundProgress(offeringId: string, targetCents: number | null) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: apps } = await supabaseAdmin
      .from("investor_applications")
      .select("id, commitment_cents, funding_status")
      .eq("offering_id", offeringId);

    const rows = (apps ?? []) as any[];
    const ids = rows.map((r) => r.id);

    let payments: any[] = [];
    if (ids.length) {
      const { data: pay } = await supabaseAdmin
        .from("payments")
        .select("application_id, amount_cents, status")
        .in("application_id", ids);
      payments = (pay ?? []) as any[];
    }

    const committedCents = rows.reduce((sum, r) => sum + Number(r.commitment_cents ?? 0), 0);
    const receivedCents = payments
      .filter((p) => p.status === "settled")
      .reduce((sum, p) => sum + Number(p.amount_cents ?? 0), 0);
    const inFlightCents = payments
      .filter((p) => p.status === "processing" || p.status === "awaiting_wire")
      .reduce((sum, p) => sum + Number(p.amount_cents ?? 0), 0);

    return {
      investors: rows.length,
      fundedInvestors: rows.filter((r) => r.funding_status === "settled").length,
      committedCents,
      receivedCents,
      inFlightCents,
      targetCents,
      percentOfTarget:
        targetCents && targetCents > 0
          ? Math.min(100, Math.round((receivedCents / targetCents) * 100))
          : null,
    };
  } catch {
    return null;
  }
}

export const acknowledgeFunding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => acknowledgeSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const application = await loadFundingApplication(supabase, userId);
    assertFundable(application);
    if (!application.commitment_cents) throw new Error("Set your commitment amount first.");

    const hash = await instructionsFingerprint(supabase, application as any, data.method);
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const forwarded = getRequestHeader("x-forwarded-for") ?? "";
    const ip = forwarded.split(",")[0]?.trim() || null;
    const userAgent = getRequestHeader("user-agent") ?? null;

    const { error } = await supabase.from("funding_acknowledgements").insert({
      application_id: application.id,
      method: data.method,
      instructions_hash: hash,
      statements: data.statements,
      ip_address: ip,
      user_agent: userAgent,
    });
    if (error) throw new Error(error.message);

    return { ok: true };
  });

export const chooseWire = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const application = await loadFundingApplication(supabase, userId);
    assertFundable(application);
    await assertAcknowledged(supabase, application as any, "wire");
    if (!application.commitment_cents) throw new Error("Set your commitment amount first.");

    const now = new Date().toISOString();
    const reference = referenceCode(application.id);

    const existing = await supabase
      .from("payments")
      .select("id")
      .eq("application_id", application.id)
      .maybeSingle();

    const payload = {
      application_id: application.id,
      method: "wire" as const,
      amount_cents: application.commitment_cents,
      status: "awaiting_wire" as const,
      reference_code: reference,
      provider: "bank_wire",
      updated_at: now,
    };

    if (existing.data) {
      const { error } = await supabase.from("payments").update(payload).eq("id", existing.data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("payments").insert(payload);
      if (error) throw new Error(error.message);
    }

    const { error: appError } = await supabase
      .from("investor_applications")
      .update({ funding_status: "awaiting_wire", updated_at: now })
      .eq("id", application.id);
    if (appError) throw new Error(appError.message);

    void (await import("@/lib/manager-alerts.server")).drainManagerAlerts().catch(() => {});
    return { ok: true, reference };
  });

export const markWireSent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => wireSentSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const application = await loadFundingApplication(supabase, userId);
    assertFundable(application);

    const now = new Date().toISOString();
    const { error } = await supabase
      .from("payments")
      .update({
        status: "processing",
        expected_date: data.expected_date,
        bank_last4: data.bank_last4,
        updated_at: now,
      })
      .eq("application_id", application.id);
    if (error) throw new Error(error.message);

    const { error: appError } = await supabase
      .from("investor_applications")
      .update({ funding_status: "processing", updated_at: now })
      .eq("id", application.id);
    if (appError) throw new Error(appError.message);

    void (await import("@/lib/manager-alerts.server")).drainManagerAlerts().catch(() => {});
    return { ok: true };
  });

/**
 * Investor submits the details of a wire they have already sent.
 * The payment moves to "processing" (pending review) — only an admin can settle it.
 */
export const submitWireConfirmation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => wireConfirmationSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const application = await loadFundingApplication(supabase, userId);
    assertFundable(application);
    await assertAcknowledged(supabase, application as any, "wire");

    const { data: payment } = await supabase
      .from("payments")
      .select("id, method, status")
      .eq("application_id", application.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!payment || payment.method !== "wire") {
      throw new Error("Choose bank wire and get your wire instructions before confirming a wire.");
    }
    if (payment.status === "settled") {
      throw new Error("This subscription is already funded.");
    }

    const { data: pendingRows } = await supabase
      .from("wire_confirmations")
      .select("id")
      .eq("application_id", application.id)
      .eq("status", "submitted")
      .limit(1);
    if (pendingRows && pendingRows.length > 0) {
      throw new Error("You already have a wire confirmation awaiting review.");
    }

    const amountCents = Math.round(Number(data.amount) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      throw new Error("Enter the amount you wired.");
    }

    const now = new Date().toISOString();
    const { error } = await supabase.from("wire_confirmations").insert({
      application_id: application.id,
      payment_id: payment.id,
      amount_cents: amountCents,
      sent_on: data.sent_on,
      sending_bank_name: data.sending_bank_name,
      sending_account_last4: data.sending_account_last4,
      bank_reference: data.bank_reference ? data.bank_reference : null,
      investor_note: data.investor_note ? data.investor_note : null,
      status: "submitted",
    });
    if (error) throw new Error(error.message);

    const { error: payError } = await supabase
      .from("payments")
      .update({
        status: "processing",
        expected_date: data.sent_on,
        bank_last4: data.sending_account_last4,
        failure_reason: null,
        updated_at: now,
      })
      .eq("id", payment.id);
    if (payError) throw new Error(payError.message);

    const { error: appError } = await supabase
      .from("investor_applications")
      .update({ funding_status: "processing", updated_at: now })
      .eq("id", application.id);
    if (appError) throw new Error(appError.message);

    void (await import("@/lib/manager-alerts.server")).drainManagerAlerts().catch(() => {});
    return { ok: true };
  });

export const startAchDebit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => achSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const application = await loadFundingApplication(supabase, userId);
    assertFundable(application);
    await assertAcknowledged(supabase, application as any, "ach");
    if (!application.commitment_cents) throw new Error("Set your commitment amount first.");

    const now = new Date().toISOString();
    const reference = referenceCode(application.id);

    const payload = {
      application_id: application.id,
      method: "ach" as const,
      amount_cents: application.commitment_cents,
      status: "processing" as const,
      reference_code: reference,
      provider: "ach_manual",
      bank_last4: data.account_number.slice(-4),
      updated_at: now,
    };

    const existing = await supabase
      .from("payments")
      .select("id")
      .eq("application_id", application.id)
      .maybeSingle();

    if (existing.data) {
      const { error } = await supabase.from("payments").update(payload).eq("id", existing.data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("payments").insert(payload);
      if (error) throw new Error(error.message);
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("signature_audit_events").insert({
      application_id: application.id,
      event_type: "ach_authorization",
      metadata: {
        account_holder: data.account_holder,
        account_type: data.account_type,
        routing_last4: data.routing_number.slice(-4),
        account_last4: data.account_number.slice(-4),
        amount_cents: application.commitment_cents,
        authorized_at: now,
      },
    });

    const { error: appError } = await supabase
      .from("investor_applications")
      .update({ funding_status: "processing", updated_at: now })
      .eq("id", application.id);
    if (appError) throw new Error(appError.message);

    void (await import("@/lib/manager-alerts.server")).drainManagerAlerts().catch(() => {});
    return { ok: true, last4: data.account_number.slice(-4) };
  });
