import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const wireSentSchema = z.object({
  expected_date: z.string().trim().min(1, "Choose the date the wire was sent"),
  bank_last4: z.string().trim().regex(/^\d{4}$/, "Enter the last 4 digits of the sending account"),
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
      .from("offering_wire_instructions")
      .select("details")
      .eq("offering_id", application.offering_id)
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
      "id, offering_id, kyc_status, aml_status, accreditation_status, documents_status, funding_status, commitment_cents",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("No application found.");
  return data;
}

function assertFundable(app: {
  accreditation_status: string;
  documents_status: string;
}) {
  if (app.documents_status !== "approved") {
    throw new Error("Sign all fund documents before funding your subscription.");
  }
  if (app.accreditation_status !== "approved") {
    throw new Error(
      "Your accredited investor status must be confirmed before the fund can accept capital.",
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
        "id, offering_id, kyc_status, aml_status, accreditation_status, documents_status, funding_status, commitment_cents",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!application) return { application: null, offering: null, payment: null, reference: null };

    const { data: offeringRow } = await supabase
      .from("offerings")
      .select("id, name, min_investment_cents")
      .eq("id", application.offering_id)
      .maybeSingle();

    const { data: wireRow } = await supabase
      .from("offering_wire_instructions")
      .select("details")
      .eq("offering_id", application.offering_id)
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

    return { application, offering, payment, reference: referenceCode(application.id) };
  });

export const chooseWire = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const application = await loadFundingApplication(supabase, userId);
    assertFundable(application);
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

    return { ok: true };
  });

export const startAchDebit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => achSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const application = await loadFundingApplication(supabase, userId);
    assertFundable(application);
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

    return { ok: true, last4: data.account_number.slice(-4) };
  });
