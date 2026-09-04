import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin access required.");
}

export const getAdminAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    return { isAdmin: Boolean(data) };
  });

const queueSchema = z.object({
  filter: z
    .enum(["pending", "all", "accreditation", "documents", "funding", "approved"])
    .default("pending"),
});

export const listApplications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => queueSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    let query = supabase
      .from("investor_applications")
      .select(
        "id, user_id, offering_id, status, current_step, kyc_status, aml_status, accreditation_status, documents_status, funding_status, commitment_cents, submitted_at, created_at, updated_at",
      )
      .order("updated_at", { ascending: false })
      .limit(200);

    if (data.filter === "accreditation") query = query.eq("accreditation_status", "review");
    if (data.filter === "documents") query = query.eq("documents_status", "review");
    if (data.filter === "funding") query = query.in("funding_status", ["awaiting_wire", "processing"]);
    if (data.filter === "approved") query = query.eq("funding_status", "settled");
    if (data.filter === "pending") {
      query = query.or(
        "kyc_status.eq.review,aml_status.eq.review,accreditation_status.eq.review,documents_status.eq.review",
      );
    }

    const { data: applications, error } = await query;
    if (error) throw new Error(error.message);
    const rows = applications ?? [];

    const userIds = [...new Set(rows.map((r: any) => r.user_id))];
    const offeringIds = [...new Set(rows.map((r: any) => r.offering_id))];

    const [{ data: profiles }, { data: offerings }] = await Promise.all([
      userIds.length
        ? supabase.from("profiles").select("user_id, legal_name, email, investor_type").in("user_id", userIds)
        : Promise.resolve({ data: [] as any[] }),
      offeringIds.length
        ? supabase.from("offerings").select("id, name, reg_type").in("id", offeringIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const profileMap = new Map((profiles ?? []).map((p: any) => [p.user_id, p]));
    const offeringMap = new Map((offerings ?? []).map((o: any) => [o.id, o]));

    return {
      applications: rows.map((r: any) => ({
        ...r,
        profile: profileMap.get(r.user_id) ?? null,
        offering: offeringMap.get(r.offering_id) ?? null,
      })),
    };
  });

export const getApplicationDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ applicationId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const id = data.applicationId;

    const { data: application, error } = await supabase
      .from("investor_applications")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!application) throw new Error("Application not found.");

    const [profile, offering, accreditation, evidence, kyc, aml, subscription, signatures, audit, payments, notes, emails] =
      await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", application.user_id).maybeSingle(),
        supabase.from("offerings").select("*").eq("id", application.offering_id).maybeSingle(),
        supabase.from("accreditation_records").select("*").eq("application_id", id).maybeSingle(),
        supabase
          .from("accreditation_documents")
          .select("id, file_name, doc_kind, storage_path, uploaded_at")
          .eq("application_id", id)
          .order("uploaded_at", { ascending: false }),
        supabase.from("kyc_verifications").select("*").eq("application_id", id).maybeSingle(),
        supabase.from("aml_screenings").select("*").eq("application_id", id).maybeSingle(),
        supabase.from("subscriptions").select("*").eq("application_id", id).maybeSingle(),
        supabase
          .from("document_signatures")
          .select("id, signer_name, signer_email, signature_type, signature_value, initials, document_hash, pdf_path, signed_at, offering_document_id")
          .eq("application_id", id)
          .order("signed_at", { ascending: true }),
        supabase
          .from("signature_audit_events")
          .select("id, event_type, ip_address, user_agent, created_at")
          .eq("application_id", id)
          .order("created_at", { ascending: false })
          .limit(50),
        supabase.from("payments").select("*").eq("application_id", id).order("created_at", { ascending: false }),
        supabase
          .from("admin_notes")
          .select("id, body, author_id, created_at")
          .eq("application_id", id)
          .order("created_at", { ascending: false }),
        supabase
          .from("investor_emails")
          .select("id, to_email, subject, body, status, provider_error, created_at")
          .eq("application_id", id)
          .order("created_at", { ascending: false }),
      ]);

    const documentIds = (signatures.data ?? []).map((s: any) => s.offering_document_id);
    const { data: offeringDocuments } = documentIds.length
      ? await supabase.from("offering_documents").select("id, title, doc_type").in("id", documentIds)
      : { data: [] as any[] };
    const docMap = new Map((offeringDocuments ?? []).map((d: any) => [d.id, d]));

    return {
      application,
      profile: profile.data ?? null,
      offering: offering.data ?? null,
      accreditation: accreditation.data ?? null,
      evidence: evidence.data ?? [],
      kyc: kyc.data ?? null,
      aml: aml.data ?? null,
      subscription: subscription.data ?? null,
      signatures: (signatures.data ?? []).map((s: any) => ({
        ...s,
        document: docMap.get(s.offering_document_id) ?? null,
      })),
      audit: audit.data ?? [],
      payments: payments.data ?? [],
      notes: notes.data ?? [],
      emails: emails.data ?? [],
    };
  });

const decisionSchema = z.object({
  applicationId: z.string().uuid(),
  area: z.enum(["kyc", "aml", "accreditation", "documents"]),
  decision: z.enum(["approved", "declined", "review"]),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export const decideApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => decisionSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const now = new Date().toISOString();

    const column = `${data.area}_status` as const;
    const { error } = await supabase
      .from("investor_applications")
      .update({ [column]: data.decision, updated_at: now } as any)
      .eq("id", data.applicationId);
    if (error) throw new Error(error.message);

    if (data.area === "accreditation") {
      const { data: record } = await supabase
        .from("accreditation_records")
        .select("id")
        .eq("application_id", data.applicationId)
        .maybeSingle();
      if (record) {
        await supabase
          .from("accreditation_records")
          .update({
            status: data.decision,
            reviewer_id: userId,
            review_notes: data.notes || null,
            verified_at: data.decision === "approved" ? now : null,
            updated_at: now,
          })
          .eq("id", record.id);
      }
    }

    if (data.notes) {
      await supabase.from("admin_notes").insert({
        application_id: data.applicationId,
        author_id: userId,
        body: `[${data.area} → ${data.decision}] ${data.notes}`,
      });
    }

    return { ok: true };
  });

export const addAdminNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ applicationId: z.string().uuid(), body: z.string().trim().min(1).max(2000) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await supabase.from("admin_notes").insert({
      application_id: data.applicationId,
      author_id: userId,
      body: data.body,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getAdminFileUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        bucket: z.enum(["accreditation-docs", "signed-documents"]),
        path: z.string().trim().min(1).max(400),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data: signed, error } = await supabase.storage
      .from(data.bucket)
      .createSignedUrl(data.path, 300);
    if (error) throw new Error(error.message);
    return { url: signed?.signedUrl ?? null };
  });

const emailSchema = z.object({
  applicationId: z.string().uuid(),
  subject: z.string().trim().min(2).max(200),
  body: z.string().trim().min(2).max(5000),
});

export const sendInvestorEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => emailSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { data: application } = await supabase
      .from("investor_applications")
      .select("id, user_id")
      .eq("id", data.applicationId)
      .maybeSingle();
    if (!application) throw new Error("Application not found.");

    const { data: profile } = await supabase
      .from("profiles")
      .select("email, legal_name")
      .eq("user_id", application.user_id)
      .maybeSingle();

    const to = profile?.email;
    if (!to) throw new Error("This investor has no email address on file.");

    const { data: row, error: insertError } = await supabase
      .from("investor_emails")
      .insert({
        application_id: data.applicationId,
        sent_by: userId,
        to_email: to,
        subject: data.subject,
        body: data.body,
        status: "queued",
      })
      .select("id")
      .single();
    if (insertError) throw new Error(insertError.message);

    const { data: offering } = await supabase
      .from("investor_applications")
      .select("offerings(name)")
      .eq("id", data.applicationId)
      .maybeSingle();
    const offeringName = (offering as any)?.offerings?.name ?? "Harmonious";

    try {
      const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
      const result = await sendTemplateEmail("investor-message", to, {
        templateData: {
          investorName: profile?.legal_name ?? "Investor",
          subject: data.subject,
          body: data.body,
          offeringName,
        },
        idempotencyKey: `investor-email-${row.id}`,
      });

      if (!result.sent) {
        await supabase
          .from("investor_emails")
          .update({
            status: "suppressed",
            provider_error: "Recipient is suppressed (prior bounce, complaint, or unsubscribe).",
          })
          .eq("id", row.id);
        return {
          ok: false,
          status: "failed" as const,
          message: "This address has opted out or previously bounced, so the message was not sent.",
        };
      }

      await supabase.from("investor_emails").update({ status: "sent" }).eq("id", row.id);
      return { ok: true, status: "sent" as const, message: `Email sent to ${to}.` };
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown error";
      await supabase
        .from("investor_emails")
        .update({ status: "failed", provider_error: detail.slice(0, 500) })
        .eq("id", row.id);
      return { ok: false, status: "failed" as const, message: "Could not send the email." };
    }
  });
