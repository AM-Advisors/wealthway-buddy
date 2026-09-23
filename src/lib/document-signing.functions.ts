import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { applicationIdForOffering } from "@/lib/active-application";
import { requireOperations } from "@/lib/ops-access.functions";
import {
  CAPACITY_LABELS,
  EXECUTION_LABELS,
  executionState,
  publicSigner,
  staffActionAllowed,
  type SignerCapacity,
} from "@/lib/document-signing";

const docScope = z.object({
  offering_document_id: z.string().uuid(),
  offering_id: z.string().uuid().optional(),
});

/** Signing state for every document in the investor's fund. */
export const getSigningStates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ offering_id: z.string().uuid().optional() }).parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const applicationId = await applicationIdForOffering(supabase, userId, data.offering_id);
    const { data: application } = await supabase
      .from("investor_applications")
      .select("id, offering_id, user_id")
      .eq("id", applicationId)
      .maybeSingle();
    if (!application || application.user_id !== userId) {
      return { provider: "internal" as const, documents: [] };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: signatures }, { data: signers }] = await Promise.all([
      supabaseAdmin
        .from("document_signatures")
        .select(
          "id, offering_document_id, provider, provider_status, provider_completed_at, signer_name, signer_capacity, box_file_id, pdf_path",
        )
        .eq("application_id", application.id),
      supabaseAdmin
        .from("document_signature_signers")
        .select("*")
        .eq("application_id", application.id),
    ]);

    const provider =
      process.env["BOX_CLIENT_ID"] && process.env["BOX_CLIENT_SECRET"] && process.env["BOX_ENTERPRISE_ID"]
        ? ("box_sign" as const)
        : ("internal" as const);

    const byDoc = new Map<string, any>();
    for (const signature of (signatures ?? []) as any[]) {
      const rows = ((signers ?? []) as any[]).filter((s) => s.signature_id === signature.id);
      const mine = rows.find((s) => s.signer_user_id === userId) ?? rows[0] ?? null;
      const state = rows.length ? executionState(rows) : "not_sent";
      byDoc.set(signature.offering_document_id, {
        documentId: signature.offering_document_id,
        signatureId: signature.id,
        state,
        stateLabel: EXECUTION_LABELS[state],
        signers: rows.map(publicSigner),
        yourStatus: String(mine?.status ?? "pending"),
        youMustSign: !mine || !["signed", "declined"].includes(String(mine.status)),
        signedAt: signature.provider_completed_at,
        signerName: signature.signer_name,
        signerCapacityLabel:
          CAPACITY_LABELS[(signature.signer_capacity ?? "individual") as SignerCapacity] ?? "Signer",
        signedDocumentAvailable: Boolean(
          signature.provider_completed_at && (signature.box_file_id || signature.pdf_path),
        ),
      });
    }

    return { provider, documents: Array.from(byDoc.values()) };
  });

/**
 * Opens the Box signing ceremony for this person on this exact document.
 * The browser sends only our own document id; Box ids are resolved here.
 */
export const startSigningSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => docScope.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const applicationId = await applicationIdForOffering(supabase, userId, data.offering_id);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { openSigningSession } = await import("@/lib/document-signing.server");

    const result = await openSigningSession(supabase, supabaseAdmin, userId, {
      applicationId,
      offeringDocumentId: data.offering_document_id,
    });
    return { signingUrl: result.signingUrl, reused: result.reused };
  });

/**
 * Asks Box what actually happened. Closing the modal calls this; it cannot
 * mark anything signed by itself — only Box's own status can.
 */
export const refreshSigningState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => docScope.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const applicationId = await applicationIdForOffering(supabase, userId, data.offering_id);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { resolveSigning, syncSignersFromBox } = await import("@/lib/document-signing.server");

    const resolved = await resolveSigning(supabase, supabaseAdmin, userId, {
      applicationId,
      offeringDocumentId: data.offering_document_id,
    });

    const agreementId = resolved.signature?.provider_agreement_id as string | undefined;
    if (!agreementId) return { state: "not_sent" as const };

    await syncSignersFromBox(supabaseAdmin, agreementId).catch(() => null);
    const { syncBoxSignRequest } = await import("@/lib/box-sign-complete.server");
    await syncBoxSignRequest(agreementId).catch(() => null);

    const { data: rows } = await supabaseAdmin
      .from("document_signature_signers")
      .select("status, required")
      .eq("signature_id", resolved.signature.id);

    return { state: executionState((rows ?? []) as any[]) };
  });

// ---------------------------------------------------------------------------
// Harmonious Operations
// ---------------------------------------------------------------------------

/** Every signing request Operations may see, with per-signer state. */
export const listSignatureRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ offering_id: z.string().uuid().optional(), limit: z.number().int().max(200).optional() })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { capabilities } = await requireOperations(context, "documents", "see");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("document_signature_signers")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (data.offering_id) query = query.eq("offering_id", data.offering_id);

    const { data: signers } = await query;
    const rows = (signers ?? []) as any[];
    const signatureIds = Array.from(new Set(rows.map((r) => r.signature_id)));
    const applicationIds = Array.from(new Set(rows.map((r) => r.application_id)));
    const documentIds = Array.from(new Set(rows.map((r) => r.offering_document_id)));

    const [{ data: signatures }, { data: applications }, { data: documents }] = await Promise.all([
      signatureIds.length
        ? supabaseAdmin
            .from("document_signatures")
            .select(
              "id, provider_agreement_id, provider_status, provider_sent_at, provider_completed_at, cancelled_at, source_file_version_id, signed_file_version_id, provider_error",
            )
            .in("id", signatureIds)
        : Promise.resolve({ data: [] as any[] }),
      applicationIds.length
        ? supabaseAdmin
            .from("investor_applications")
            .select("id, offering_id, user_id")
            .in("id", applicationIds)
        : Promise.resolve({ data: [] as any[] }),
      documentIds.length
        ? supabaseAdmin.from("offering_documents").select("id, title").in("id", documentIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const sigById = new Map(((signatures ?? []) as any[]).map((s) => [s.id, s]));
    const appById = new Map(((applications ?? []) as any[]).map((a) => [a.id, a]));
    const docById = new Map(((documents ?? []) as any[]).map((d) => [d.id, d]));

    const grouped = new Map<string, any>();
    for (const row of rows) {
      const signature = sigById.get(row.signature_id);
      const entry = grouped.get(row.signature_id) ?? {
        signatureId: row.signature_id,
        applicationId: row.application_id,
        offeringId: row.offering_id ?? appById.get(row.application_id)?.offering_id ?? null,
        investmentProfileId: row.investment_profile_id ?? null,
        documentTitle: docById.get(row.offering_document_id)?.title ?? "Fund document",
        sentAt: signature?.provider_sent_at ?? null,
        completedAt: signature?.provider_completed_at ?? null,
        cancelledAt: signature?.cancelled_at ?? null,
        providerError: signature?.provider_error ?? null,
        sourceVersionId: signature?.source_file_version_id ?? null,
        signedVersionId: signature?.signed_file_version_id ?? null,
        signers: [] as any[],
      };
      entry.signers.push(publicSigner(row));
      grouped.set(row.signature_id, entry);
    }

    const requests = Array.from(grouped.values()).map((entry) => {
      const state = executionState(entry.signers);
      return { ...entry, state, stateLabel: EXECUTION_LABELS[state] };
    });

    return {
      requests,
      canResend: capabilities.includes("documents:prepare"),
      canCancel: capabilities.includes("documents:review"),
    };
  });

const staffAction = z.object({
  signature_id: z.string().uuid(),
  action: z.enum(["resend", "cancel"]),
});

/** Resend or cancel an outstanding request. Executed history is never touched. */
export const actOnSignatureRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => staffAction.parse(data))
  .handler(async ({ data, context }) => {
    const { capabilities } = await requireOperations(
      context,
      "documents",
      data.action === "cancel" ? "review" : "prepare",
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: signature } = await supabaseAdmin
      .from("document_signatures")
      .select("id, application_id, provider_agreement_id, provider_status")
      .eq("id", data.signature_id)
      .maybeSingle();
    if (!signature?.provider_agreement_id) throw new Error("No signing request for that document.");

    const { data: signers } = await supabaseAdmin
      .from("document_signature_signers")
      .select("status, required")
      .eq("signature_id", signature.id);

    const state = executionState((signers ?? []) as any[]);
    const verdict = staffActionAllowed({ action: data.action, capabilities, executionState: state });
    if (!verdict.allowed) throw new Error(`Forbidden: ${verdict.reason}`);

    const box = await import("@/lib/box.server");
    const now = new Date().toISOString();

    if (data.action === "resend") {
      await box.resendSignRequest(signature.provider_agreement_id);
      await supabaseAdmin
        .from("document_signatures")
        .update({ provider_last_event_at: now })
        .eq("id", signature.id);
    } else {
      await box.cancelSignRequest(signature.provider_agreement_id);
      await supabaseAdmin
        .from("document_signatures")
        .update({ provider_status: "cancelled", cancelled_at: now, cancelled_by: context.userId })
        .eq("id", signature.id);
      for (const row of ((signers ?? []) as any[]).filter((s) => s.status !== "signed")) {
        void row;
      }
      await supabaseAdmin
        .from("document_signature_signers")
        .update({ status: "cancelled", last_event_at: now })
        .eq("signature_id", signature.id)
        .neq("status", "signed");
    }

    await supabaseAdmin.from("signature_audit_events").insert({
      application_id: signature.application_id,
      signature_id: signature.id,
      event_type: data.action === "cancel" ? "box_sign_cancelled_by_staff" : "box_sign_resent",
      metadata: { sign_request_id: signature.provider_agreement_id, actor: context.userId },
    });

    return { ok: true, action: data.action };
  });
