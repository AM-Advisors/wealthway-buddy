import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Reviewers are admins (all funds) and fund managers (their assigned funds).
// Row scoping for fund managers is enforced by the database policies.
async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "fund_manager"]);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Forbidden: reviewer access required.");
}

// Administrator access comes only from an explicit role assignment in user_roles.
// Signing in with a company Google account never grants privileges on its own.
export const getAdminAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const roles = (data ?? []).map((r: any) => r.role as string);
    const isAdmin = roles.includes("admin");
    const isFundManager = roles.includes("fund_manager");




    let offeringIds: string[] = [];
    if (isFundManager && !isAdmin) {
      const { data: assignments } = await context.supabase
        .from("fund_managers")
        .select("offering_id")
        .eq("user_id", context.userId);
      offeringIds = (assignments ?? []).map((a: any) => a.offering_id as string);
    }

    return { isAdmin, isFundManager, isReviewer: isAdmin || isFundManager, offeringIds };
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
        "id, user_id, offering_id, status, current_step, kyc_status, aml_status, accreditation_status, documents_status, funding_status, commitment_cents, source, submitted_at, created_at, updated_at",
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
          .select("id, signer_name, signer_email, signature_type, signature_value, initials, document_hash, pdf_path, signed_at, offering_document_id, provider, provider_status, provider_sent_at, provider_viewed_at, provider_completed_at, provider_agreement_id")
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
          .select(
            "id, to_email, subject, body, status, provider_error, created_at, delivery_event, delivery_event_at, delivery_detail",
          )
          .eq("application_id", id)
          .order("created_at", { ascending: false }),
      ]);

    const { data: wireConfirmations } = await supabase
      .from("wire_confirmations")
      .select("*")
      .eq("application_id", id)
      .order("created_at", { ascending: false });

    const { data: fundingAcknowledgements } = await supabase
      .from("funding_acknowledgements")
      .select("id, method, instructions_hash, statements, acknowledged_at, ip_address, user_agent")
      .eq("application_id", id)
      .order("acknowledged_at", { ascending: false });

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
      wireConfirmations: wireConfirmations ?? [],
      fundingAcknowledgements: fundingAcknowledgements ?? [],
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
    const authz = await import("@/lib/reviewer-authz.server");
    const { db } = await authz.authorizeApplication(userId, data.applicationId);
    const now = new Date().toISOString();

    const column = `${data.area}_status` as const;
    const { data: before } = await db
      .from("investor_applications")
      .select(column)
      .eq("id", data.applicationId)
      .maybeSingle();
    const previousStatus = (before as any)?.[column] ?? null;
    const { error } = await db
      .from("investor_applications")
      .update({ [column]: data.decision, updated_at: now } as any)
      .eq("id", data.applicationId);
    if (error) throw new Error(error.message);

    if (data.area === "accreditation") {
      const { data: record } = await db
        .from("accreditation_records")
        .select("id")
        .eq("application_id", data.applicationId)
        .maybeSingle();
      if (record) {
        await db
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
      await db.from("admin_notes").insert({
        application_id: data.applicationId,
        author_id: userId,
        body: `[${data.area} → ${data.decision}] ${data.notes}`,
      });
    }

    const activity = await import("@/lib/reviewer-activity.server");
    await activity.logReviewerActivity(supabase, {
      actorId: userId,
      applicationId: data.applicationId,
      offeringId: await activity.offeringIdForApplication(supabase, data.applicationId),
      action: "application_decision",
      area: data.area,
      outcome: data.decision === "review" ? "delayed" : data.decision,
      summary: `${data.area} marked ${data.decision === "review" ? "needs more review" : data.decision}`,
      note: data.notes || null,
      metadata: { field: column, previous: previousStatus, next: data.decision },
    });

    void (await import("@/lib/manager-alerts.server")).drainManagerAlerts().catch(() => {});
    return { ok: true };
  });

export const addAdminNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ applicationId: z.string().uuid(), body: z.string().trim().min(1).max(2000) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const authz = await import("@/lib/reviewer-authz.server");
    const { db } = await authz.authorizeApplication(userId, data.applicationId);
    // author_id and created_at always come from the server, never the browser.
    const { error } = await db.from("admin_notes").insert({
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
    const authz = await import("@/lib/reviewer-authz.server");
    const { db, application } = await authz.authorizeApplication(userId, data.applicationId);

    const { data: profile } = await supabase
      .from("profiles")
      .select("email, legal_name")
      .eq("user_id", application.user_id)
      .maybeSingle();

    const to = profile?.email;
    if (!to) throw new Error("This investor has no email address on file.");

    const { data: row, error: insertError } = await db
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
      const { buildOpenPixelUrl } = await import("@/lib/email-tracking.server");
      const pixelUrl = await buildOpenPixelUrl({
        recipient: to,
        template: "investor-message",
        emailId: row.id as string,
        applicationId: data.applicationId,
      });
      const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
      const result = await sendTemplateEmail("investor-message", to, {
        templateData: {
          investorName: profile?.legal_name ?? "Investor",
          subject: data.subject,
          body: data.body,
          offeringName,
          pixelUrl,
        },
        idempotencyKey: `investor-email-${row.id}`,
      });

      if (!result.sent) {
        await db
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

      await db.from("investor_emails").update({ status: "sent" }).eq("id", row.id);
      return { ok: true, status: "sent" as const, message: `Email sent to ${to}.` };
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown error";
      await db
        .from("investor_emails")
        .update({ status: "failed", provider_error: detail.slice(0, 500) })
        .eq("id", row.id);
      return { ok: false, status: "failed" as const, message: "Could not send the email." };
    }
  });

const testEmailSchema = z.object({
  to: z.string().trim().email().max(255),
  subject: z.string().trim().min(2).max(200),
  body: z.string().trim().min(2).max(5000),
  applicationId: z.string().uuid().optional(),
});

const lastTestSendByUser = new Map<string, number>();

const invitationSchema = z.object({
  to: z.string().trim().email().max(255),
  applicationId: z.string().uuid().optional(),
});

/** Sends the full onboarding invitation email to one address (admin only). */
export const sendOnboardingInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => invitationSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    let offeringName = "Harmonious";
    let investorName = "Investor";
    if (data.applicationId) {
      const { data: row } = await supabase
        .from("investor_applications")
        .select("user_id, offerings(name)")
        .eq("id", data.applicationId)
        .maybeSingle();
      offeringName = (row as any)?.offerings?.name ?? offeringName;
      if ((row as any)?.user_id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("legal_name")
          .eq("user_id", (row as any).user_id)
          .maybeSingle();
        investorName = profile?.legal_name ?? investorName;
      }
    }

    const { buildTrackedUrl, buildOpenPixelUrl } = await import("@/lib/email-tracking.server");
    const portalUrl = await buildTrackedUrl({
      url: "https://app.harmonious.co/dashboard",
      recipient: data.to,
      template: "investor-invitation",
      label: "Begin onboarding",
    });
    const pixelUrl = await buildOpenPixelUrl({
      recipient: data.to,
      template: "investor-invitation",
      ...(data.applicationId ? { applicationId: data.applicationId } : {}),
    });

    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    const result = await sendTemplateEmail("investor-invitation", data.to, {
      templateData: {
        investorName,
        offeringName,
        portalUrl,
        contactEmail: "operations@harmonious.co",
        pixelUrl,
      },
      idempotencyKey: `invitation-${data.to}-${Date.now()}`,
    });


    if (!result.sent) {
      return { ok: false, message: "That address has opted out or previously bounced." };
    }
    return { ok: true, message: `Onboarding email sent to ${data.to}.` };
  });

export const sendTestEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => testEmailSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const now = Date.now();
    const last = lastTestSendByUser.get(userId) ?? 0;
    if (now - last < 15_000) {
      return {
        ok: false,
        message: `Please wait ${Math.ceil((15_000 - (now - last)) / 1000)}s before sending another test.`,
      };
    }
    lastTestSendByUser.set(userId, now);

    let offeringName = "Harmonious";
    if (data.applicationId) {
      const { data: offering } = await supabase
        .from("investor_applications")
        .select("offerings(name)")
        .eq("id", data.applicationId)
        .maybeSingle();
      offeringName = (offering as any)?.offerings?.name ?? offeringName;
    }

    try {
      const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
      const result = await sendTemplateEmail("investor-message", data.to, {
        templateData: {
          investorName: "Test recipient",
          subject: `[TEST] ${data.subject}`,
          body: data.body,
          offeringName,
        },
        idempotencyKey: `test-email-${userId}-${now}`,
      });

      if (!result.sent) {
        return {
          ok: false,
          message: "That address has opted out or previously bounced, so nothing was sent.",
        };
      }
      return { ok: true, message: `Test email sent to ${data.to}.` };
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown error";
      return { ok: false, message: `Could not send the test email. ${detail.slice(0, 200)}` };
    }
  });

const paymentDecisionSchema = z.object({

  paymentId: z.string().uuid(),
  applicationId: z.string().uuid(),
  outcome: z.enum(["settled", "returned", "cancelled"]),
});

export const decidePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => paymentDecisionSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const authz = await import("@/lib/reviewer-authz.server");
    // Resolve the payment server-side; the browser's applicationId is only trusted
    // once it matches the payment's own application.
    const { db, application } = await authz.authorizePayment(userId, data.paymentId);
    if ((application as any).id !== data.applicationId) {
      throw new Error("That payment does not belong to this application.");
    }
    const now = new Date().toISOString();

    const { error } = await db
      .from("payments")
      .update({
        status: data.outcome,
        confirmed_at: data.outcome === "settled" ? now : null,
        updated_at: now,
      })
      .eq("id", data.paymentId);
    if (error) throw new Error(error.message);

    const { error: appError } = await db
      .from("investor_applications")
      .update({
        funding_status: data.outcome,
        status: data.outcome === "settled" ? "funded" : "submitted",
        updated_at: now,
      })
      .eq("id", data.applicationId);
    if (appError) throw new Error(appError.message);

    const paymentActivity = await import("@/lib/reviewer-activity.server");
    const paymentOfferingId = await paymentActivity.offeringIdForApplication(
      supabase,
      data.applicationId,
    );
    await paymentActivity.logReviewerActivity(supabase, {
      actorId: userId,
      applicationId: data.applicationId,
      offeringId: paymentOfferingId,
      action: "payment_decision",
      area: "funding",
      outcome: data.outcome === "settled" ? "approved" : "declined",
      summary: `Payment marked ${data.outcome}`,
    });

    void (await import("@/lib/manager-alerts.server")).drainManagerAlerts().catch(() => {});
    if (paymentOfferingId) {
      await (await import("@/lib/ownership-email.server")).notifyOwnershipChange(
        paymentOfferingId,
        "A payment for this fund was updated, so the ownership split has been recalculated.",
      );
    }
    return { ok: true };
  });


export const listDiditEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ applicationId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data: rows, error } = await supabase
      .from("didit_webhook_events")
      .select("event_id, webhook_type, status, received_at, error")
      .eq("application_id", data.applicationId)
      .order("received_at", { ascending: false })
      .limit(15);
    if (error) throw new Error(error.message);
    return { events: rows ?? [] };
  });

const wireDecisionSchema = z.object({
  applicationId: z.string().uuid(),
  confirmationId: z.string().uuid(),
  outcome: z.enum(["approved", "rejected"]),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

/** Approve or reject an investor-submitted wire confirmation before funds are marked received. */
export const decideWireConfirmation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => wireDecisionSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const authz = await import("@/lib/reviewer-authz.server");
    const { db } = await authz.authorizeApplication(userId, data.applicationId);
    const now = new Date().toISOString();

    if (data.outcome === "rejected" && !data.notes) {
      throw new Error("Add a short reason so the investor knows what to correct.");
    }

    const { data: confirmation, error: loadError } = await supabase
      .from("wire_confirmations")
      .select("*")
      .eq("id", data.confirmationId)
      .eq("application_id", data.applicationId)
      .maybeSingle();
    if (loadError) throw new Error(loadError.message);
    if (!confirmation) throw new Error("Wire confirmation not found.");
    if (confirmation.status !== "submitted") {
      throw new Error("This wire confirmation has already been decided.");
    }

    const { error } = await supabase
      .from("wire_confirmations")
      .update({
        status: data.outcome,
        reviewed_by: userId,
        reviewed_at: now,
        review_notes: data.notes || null,
        updated_at: now,
      })
      .eq("id", data.confirmationId);
    if (error) throw new Error(error.message);

    const paymentUpdate =
      data.outcome === "approved"
        ? { status: "settled" as const, confirmed_at: now, failure_reason: null, updated_at: now }
        : {
            status: "awaiting_wire" as const,
            confirmed_at: null,
            failure_reason: data.notes || "Wire confirmation rejected",
            updated_at: now,
          };

    if (confirmation.payment_id) {
      const { error: payError } = await db
        .from("payments")
        .update(paymentUpdate)
        .eq("id", confirmation.payment_id);
      if (payError) throw new Error(payError.message);
    }

    const { error: appError } = await db
      .from("investor_applications")
      .update({
        funding_status: data.outcome === "approved" ? "settled" : "awaiting_wire",
        status: data.outcome === "approved" ? "funded" : "submitted",
        updated_at: now,
      })
      .eq("id", data.applicationId);
    if (appError) throw new Error(appError.message);

    const wireActivity = await import("@/lib/reviewer-activity.server");
    await wireActivity.logReviewerActivity(supabase, {
      actorId: userId,
      applicationId: data.applicationId,
      offeringId: await wireActivity.offeringIdForApplication(supabase, data.applicationId),
      action: "wire_decision",
      area: "wire",
      outcome: data.outcome === "approved" ? "approved" : "declined",
      summary:
        data.outcome === "approved"
          ? "Wire confirmation approved and funding marked received"
          : "Wire confirmation sent back to the investor",
      note: data.notes || null,
    });

    void (await import("@/lib/manager-alerts.server")).drainManagerAlerts().catch(() => {});
    return { ok: true };
  });
