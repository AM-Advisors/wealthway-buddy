import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/require-auth";

const STAFF_ROLES = ["admin", "super_admin", "operations", "fund_administration"];
const BANKS = ["mercury", "texas_capital", "customers"] as const;
const KYC_URL = "https://app.harmonious.co/onboarding/kyc";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}
async function isStaff(context: any) {
  const { data } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
  return ((data ?? []) as any[]).some((r) => STAFF_ROLES.includes(r.role));
}
async function requireMember(context: any, clientId: string) {
  const { data } = await context.supabase.from("client_users").select("client_id").eq("user_id", context.userId).eq("client_id", clientId).maybeSingle();
  if (!data && !(await isStaff(context))) throw new Error("You aren't a member of this organisation.");
}

/**
 * Identity-check status for fee recipients. Returns only "verified" or "needs_verification"
 * so a client can't learn whether an email exists in Harmonious.
 */
export const checkFeeRecipientKyc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().uuid(), emails: z.array(z.string().trim().email().max(255)).max(25) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireMember(context, data.clientId);
    const db = await admin();
    const out: Record<string, "verified" | "needs_verification"> = {};
    for (const raw of data.emails) {
      const email = raw.toLowerCase();
      const { data: rows } = await db.from("persons").select("kyc_status, aml_status").ilike("email", email).limit(5);
      out[email] = ((rows ?? []) as any[]).some((p) => p.kyc_status === "approved" && p.aml_status === "approved") ? "verified" : "needs_verification";
    }
    return out;
  });

/** Email a fee recipient asking them to complete identity verification (explicit click only). */
export const inviteFeeRecipientKyc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ clientId: z.string().uuid(), name: z.string().trim().min(1).max(160), email: z.string().trim().email().max(255), fundName: z.string().trim().max(200).default("") }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireMember(context, data.clientId);
    const db = await admin();
    const { data: client } = await db.from("clients").select("name").eq("id", data.clientId).maybeSingle();
    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    const day = new Date().toISOString().slice(0, 10);
    await sendTemplateEmail("client-admin-alert", data.email.toLowerCase(), {
      templateData: {
        contactName: data.name,
        headline: "Please verify your identity with Harmonious",
        intro: `${client?.name ?? "A Harmonious client"} listed you to receive carry or management fees${data.fundName ? ` from ${data.fundName}` : ""}. Harmonious needs to verify your identity before any fees can be allocated to you.`,
        actionLabel: "Verify my identity",
        actionUrl: KYC_URL,
        footnote: "Sign in or create an account with this email address, then follow the steps. It takes about five minutes.",
      },
      idempotencyKey: `fee-recipient-kyc-${data.clientId}-${data.email.toLowerCase()}-${day}`,
    });
    await db.from("contract_audit_events").insert({
      actor_id: context.userId, actor_role: "client", client_id: data.clientId, area: "onboarding",
      action: "client invited fee recipient to identity verification", target: data.email.toLowerCase(), source: "web",
    });
    return { ok: true };
  });

/** Current bank setup packets (staff-uploaded) with short-lived download links. */
export const listBankPackets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().uuid().nullable().optional(), bank: z.enum(BANKS).nullable().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const staff = await isStaff(context);
    if (!staff) {
      if (!data.clientId) throw new Error("Forbidden");
      await requireMember(context, data.clientId);
    }
    const db = await admin();
    let q = db.from("bank_setup_packets").select("id, bank, title, checklist, file_name, storage_path, created_at").is("retired_at", null).order("created_at", { ascending: false });
    if (data.bank) q = q.eq("bank", data.bank);
    const { data: rows } = await q;
    const out = [];
    for (const r of (rows ?? []) as any[]) {
      const { data: signed } = await db.storage.from("client-contracts").createSignedUrl(r.storage_path, 600);
      out.push({ id: String(r.id), bank: String(r.bank), title: String(r.title), checklist: String(r.checklist ?? ""), fileName: String(r.file_name), url: signed?.signedUrl ?? null, createdAt: String(r.created_at) });
    }
    return { staff, packets: out };
  });

export const uploadBankPacket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      bank: z.enum(BANKS), title: z.string().trim().min(1).max(160), checklist: z.string().trim().max(4000).default(""),
      fileName: z.string().min(1).max(200), contentType: z.string().max(120), base64: z.string().max(28_000_000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!(await isStaff(context))) throw new Error("Only the Harmonious team can manage bank packets.");
    const allowed = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword", "application/zip"];
    if (!allowed.includes(data.contentType)) throw new Error("Upload a PDF, Word document or ZIP.");
    const bytes = Buffer.from(data.base64, "base64");
    if (bytes.byteLength > 20 * 1024 * 1024) throw new Error("Files must be 20 MB or smaller.");
    const path = `bank-packets/${data.bank}/${crypto.randomUUID()}/${data.fileName.replace(/[^a-zA-Z0-9._-]+/g, "_")}`;
    const db = await admin();
    const { error } = await db.storage.from("client-contracts").upload(path, bytes, { contentType: data.contentType, upsert: false });
    if (error) throw new Error("Upload failed. Please try again.");
    await db.from("bank_setup_packets").insert({ bank: data.bank, title: data.title, checklist: data.checklist, file_name: data.fileName, storage_path: path, uploaded_by: context.userId });
    return { ok: true };
  });

/** Retire (never delete) a packet so new requests stop seeing it. */
export const retireBankPacket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    if (!(await isStaff(context))) throw new Error("Only the Harmonious team can manage bank packets.");
    const db = await admin();
    await db.from("bank_setup_packets").update({ retired_at: new Date().toISOString(), retired_by: context.userId }).eq("id", data.id).is("retired_at", null);
    return { ok: true };
  });
