// Fund manager approval step: an investor's file must be approved by an
// assigned fund manager (or an administrator) before funding opens. Approving
// also sends the investor their welcome message with the diligence room link.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logReviewerActivity } from "@/lib/reviewer-activity.server";

export const APPROVAL_LABELS: Record<string, string> = {
  pending: "Awaiting manager approval",
  approved: "Approved",
  declined: "Sent back",
};

async function reviewerScope(supabase: any, userId: string) {
  const [{ data: roleRows }, { data: fundRows }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", userId),
    supabase.from("fund_managers").select("offering_id").eq("user_id", userId),
  ]);
  const roles = (roleRows ?? []).map((r: any) => r.role as string);
  const isAdmin = roles.includes("admin");
  const fundIds = (fundRows ?? []).map((f: any) => f.offering_id as string);
  if (!isAdmin && fundIds.length === 0) {
    throw new Error("Forbidden: fund manager access required.");
  }
  return { isAdmin, fundIds };
}

export type ApprovalRow = {
  id: string;
  offering_id: string;
  offeringName: string | null;
  investorName: string | null;
  investorEmail: string | null;
  commitment_cents: number | null;
  kyc_status: string;
  aml_status: string;
  accreditation_status: string;
  documents_status: string;
  funding_status: string;
  manager_review_status: string;
  manager_reviewed_at: string | null;
  manager_review_notes: string | null;
  reviewerName: string | null;
  created_at: string;
  readyForApproval: boolean;
};

export const getApprovalQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { isAdmin, fundIds } = await reviewerScope(supabase, userId);

    let query = supabase
      .from("investor_applications")
      .select(
        "id, user_id, offering_id, commitment_cents, kyc_status, aml_status, accreditation_status, documents_status, funding_status, manager_review_status, manager_reviewed_at, manager_reviewed_by, manager_review_notes, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(400);
    if (!isAdmin) query = query.in("offering_id", fundIds);

    const { data: apps, error } = await query;
    if (error) throw new Error(error.message);

    const rows = (apps ?? []) as any[];
    const userIds = Array.from(
      new Set(rows.flatMap((r) => [r.user_id, r.manager_reviewed_by].filter(Boolean))),
    );
    const offeringIds = Array.from(new Set(rows.map((r) => r.offering_id)));

    const [{ data: profiles }, { data: offerings }] = await Promise.all([
      userIds.length
        ? supabase.from("profiles").select("user_id, legal_name, email").in("user_id", userIds)
        : Promise.resolve({ data: [] as any[] }),
      offeringIds.length
        ? supabase.from("offerings").select("id, name").in("id", offeringIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const person = new Map<string, { name: string | null; email: string | null }>();
    for (const p of profiles ?? [])
      person.set(p.user_id, { name: p.legal_name ?? null, email: p.email ?? null });
    const fundName = new Map<string, string>();
    for (const o of offerings ?? []) fundName.set(o.id, o.name);

    const documents: ApprovalRow[] = rows.map((r) => {
      const investor = person.get(r.user_id);
      const reviewer = r.manager_reviewed_by ? person.get(r.manager_reviewed_by) : undefined;
      return {
        id: r.id,
        offering_id: r.offering_id,
        offeringName: fundName.get(r.offering_id) ?? null,
        investorName: investor?.name ?? null,
        investorEmail: investor?.email ?? null,
        commitment_cents: r.commitment_cents,
        kyc_status: r.kyc_status,
        aml_status: r.aml_status,
        accreditation_status: r.accreditation_status,
        documents_status: r.documents_status,
        funding_status: r.funding_status,
        manager_review_status: r.manager_review_status ?? "pending",
        manager_reviewed_at: r.manager_reviewed_at,
        manager_review_notes: r.manager_review_notes,
        reviewerName: reviewer?.name ?? reviewer?.email ?? null,
        created_at: r.created_at,
        readyForApproval:
          r.kyc_status === "approved" &&
          r.accreditation_status === "approved" &&
          r.documents_status === "approved",
      };
    });

    const funds = (offerings ?? [])
      .map((o: any) => ({ id: o.id as string, name: o.name as string }))
      .sort((a: any, b: any) => a.name.localeCompare(b.name));

    return { applications: documents, funds, isAdmin };
  });

export const decideApplicationApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        applicationId: z.string().uuid(),
        decision: z.enum(["approved", "declined", "pending"]),
        notes: z.string().max(1000).nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { isAdmin, fundIds } = await reviewerScope(supabase, userId);

    const { data: app } = await supabase
      .from("investor_applications")
      .select(
        "id, user_id, offering_id, commitment_cents, kyc_status, accreditation_status, documents_status, manager_review_status, welcome_email_sent_at",
      )
      .eq("id", data.applicationId)
      .maybeSingle();
    if (!app) throw new Error("That application is not available.");
    if (!isAdmin && !fundIds.includes(app.offering_id as string)) {
      throw new Error("Forbidden: you do not manage that fund.");
    }
    if (data.decision === "declined" && !data.notes?.trim()) {
      throw new Error("Add a note telling the investor what is needed before sending it back.");
    }
    if (data.decision === "approved") {
      const missing: string[] = [];
      if (app.kyc_status !== "approved") missing.push("identity check");
      if (app.accreditation_status !== "approved") missing.push("accreditation");
      if (app.documents_status !== "approved") missing.push("fund documents");
      if (missing.length) {
        throw new Error(`Complete the ${missing.join(", ")} before approving this investor.`);
      }
    }

    const { error } = await supabase
      .from("investor_applications")
      .update({
        manager_review_status: data.decision,
        manager_review_notes: data.notes?.trim() ? data.notes.trim() : null,
        manager_reviewed_by: data.decision === "pending" ? null : userId,
        manager_reviewed_at: data.decision === "pending" ? null : new Date().toISOString(),
      } as never)
      .eq("id", data.applicationId);
    if (error) throw new Error(error.message);

    await logReviewerActivity(supabase, {
      actorId: userId,
      offeringId: app.offering_id as string,
      applicationId: app.id as string,
      action: "application_approval",
      area: "application",
      outcome: data.decision,
      summary:
        data.decision === "approved"
          ? "Approved the investor's application for funding"
          : data.decision === "declined"
            ? "Sent the investor's application back"
            : "Reopened the investor's application for review",
      note: data.notes?.trim() || null,
    });

    let welcome: { sent: boolean; reason?: string } = { sent: false };
    if (data.decision === "approved" && !app.welcome_email_sent_at) {
      try {
        const { sendInvestorWelcome } = await import("@/lib/investor-welcome.server");
        welcome = await sendInvestorWelcome(app.id as string, userId);
      } catch (e: any) {
        welcome = { sent: false, reason: String(e?.message ?? e).slice(0, 200) };
      }
    }

    return { ok: true, welcome };
  });
