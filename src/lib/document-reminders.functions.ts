/**
 * "Send reminder" for the MSA, W-9/W-8 and investor questionnaire. Same branded email,
 * 24h limit and Super Admin override as signing reminders (signing-reminder.server.ts).
 * Never signs, submits or files anything.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;

export const remindMsaFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => z.object({ clientId: z.string().uuid(), overrideReason: z.string().trim().max(500).optional() }).parse(x))
  .handler(async ({ data, context }) => {
    const { assertStaff } = await import("@/lib/fund-setup.server");
    await assertStaff(context.userId);
    const d = await admin();
    const { data: c } = await d.from("clients").select("id, name, legal_name, msa_signer_user_id").eq("id", data.clientId).maybeSingle();
    if (!c) throw new Error("Client not found.");
    const { data: v } = await d.from("msa_versions").select("id, version").eq("status", "published").order("effective_date", { ascending: false }).limit(1).maybeSingle();
    if (!v) throw new Error("No Master Service Agreement has been published yet.");
    const { data: a } = await d.from("client_msa_agreements").select("status, executed_at").eq("client_id", c.id).eq("msa_version_id", v.id).maybeSingle();
    if (a?.executed_at || a?.status === "client_signed") throw new Error("This client has already signed the current MSA.");
    if (!c.msa_signer_user_id) throw new Error("Choose who is responsible to sign the MSA first.");
    const { data: p } = await d.from("profiles").select("email, legal_name").eq("user_id", c.msa_signer_user_id).maybeSingle();
    if (!p?.email) throw new Error("The assigned signer has no email on file.");
    const { sendSigningReminder } = await import("@/lib/signing-reminder.server");
    return sendSigningReminder(context.userId, {
      clientId: c.id, contextName: c.legal_name || c.name, reminderKey: `msa:${c.id}:${v.id}`, documentTitle: "the Harmonious Master Service Agreement",
      recipientEmail: p.email, recipientName: p.legal_name || "there", recipientUserId: c.msa_signer_user_id, path: "/client",
      steps: ["Sign in to Harmonious", "Read the Master Service Agreement", "Sign"],
      override: data.overrideReason ? { reason: data.overrideReason } : null,
    });
  });

export const msaLastReminderFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => z.object({ clientId: z.string().uuid() }).parse(x))
  .handler(async ({ data, context }) => {
    const { assertStaff } = await import("@/lib/fund-setup.server");
    await assertStaff(context.userId);
    const d = await admin();
    const { data: r } = await d.from("document_reminders").select("created_at").eq("client_id", data.clientId).like("reminder_key", "msa:%").eq("delivered", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
    return { lastRemindedAt: (r?.created_at as string | undefined) ?? null };
  });

const KINDS = {
  w9: { title: "your W-9 (or W-8) tax form", steps: ["Open your investment", "Download, complete and sign the W-9 (or W-8 if you're not a U.S. person)", "Upload the signed form"] },
  questionnaire: { title: "your investor questionnaire", steps: ["Open your investment", "Answer the About You questions", "Confirm and submit"] },
} as const;

/** One email per selected investor who still owes that item; skips everyone else with a reason. */
export const remindInvestorItemFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => z.object({ fundId: z.string().uuid(), onboardingIds: z.array(z.string().uuid()).min(1).max(200), kind: z.enum(["w9", "questionnaire"]), overrideReason: z.string().trim().max(500).optional() }).parse(x))
  .handler(async ({ data, context }) => {
    const { assertFund } = await import("@/lib/fund-tabs.server");
    await assertFund(context.userId, data.fundId);
    const d = await admin();
    const { sendSigningReminder } = await import("@/lib/signing-reminder.server");
    const k = KINDS[data.kind];
    const out: Array<{ id: string; outcome: "sent" | "skipped"; reason?: string }> = [];
    for (const id of data.onboardingIds) {
      const { data: ob } = await d.from("investor_onboardings").select("id, offering_id, investor_user_id, questionnaire_submitted_at, removed_at").eq("id", id).maybeSingle();
      if (!ob || ob.offering_id !== data.fundId || ob.removed_at) { out.push({ id, outcome: "skipped", reason: "not in this fund" }); continue; }
      if (!ob.investor_user_id) { out.push({ id, outcome: "skipped", reason: "no investor account yet" }); continue; }
      if (data.kind === "questionnaire" && ob.questionnaire_submitted_at) { out.push({ id, outcome: "skipped", reason: "questionnaire already submitted" }); continue; }
      if (data.kind === "w9") {
        const { data: doc } = await d.from("investor_documents").select("id").eq("onboarding_id", id).eq("doc_kind", "tax_form").neq("review_status", "rejected").limit(1);
        if ((doc ?? []).length) { out.push({ id, outcome: "skipped", reason: "tax form already uploaded" }); continue; }
      }
      const { data: p } = await d.from("profiles").select("email, legal_name").eq("user_id", ob.investor_user_id).maybeSingle();
      if (!p?.email) { out.push({ id, outcome: "skipped", reason: "no email on file" }); continue; }
      try {
        await sendSigningReminder(context.userId, {
          offeringId: data.fundId, reminderKey: `${data.kind}:${id}`, documentTitle: k.title, recipientEmail: p.email, recipientName: p.legal_name || "there",
          recipientUserId: ob.investor_user_id, path: `/onboard/i/${id}`, steps: [...k.steps], override: data.overrideReason ? { reason: data.overrideReason } : null,
        });
        out.push({ id, outcome: "sent" });
      } catch (e) { out.push({ id, outcome: "skipped", reason: e instanceof Error ? e.message : "couldn't send" }); }
    }
    return out;
  });
