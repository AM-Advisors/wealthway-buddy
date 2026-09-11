// Closing module: managers confirm an investor's commitment is fully funded,
// stamp a closing date, and attach the final documents the investor keeps.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { activeApplicationId } from "@/lib/active-application";

async function canManage(supabase: any, offeringId: string) {
  const { data } = await supabase.rpc("can_manage_diligence", { _offering_id: offeringId });
  return Boolean(data);
}

export type ClosingCandidate = {
  applicationId: string;
  offeringId: string;
  offeringName: string;
  investorName: string;
  investorEmail: string | null;
  commitmentCents: number;
  receivedCents: number;
  fundingStatus: string;
  closing: {
    id: string;
    closingDate: string;
    fundedAmountCents: number;
    note: string | null;
    closedAt: string;
    documentCount: number;
  } | null;
};

/** Every investor on the manager's funds, with money in and closing state. */
export const listClosingBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const [{ data: roles }, { data: assignments }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin"),
      supabase.from("fund_managers").select("offering_id").eq("user_id", userId),
    ]);
    const isAdmin = ((roles ?? []) as any[]).length > 0;

    let offeringIds: string[] | null = null;
    if (!isAdmin) {
      offeringIds = Array.from(
        new Set(((assignments ?? []) as any[]).map((a) => a.offering_id as string)),
      );
      if (offeringIds.length === 0) return { rows: [] as ClosingCandidate[] };
    }

    let appQuery = supabase
      .from("investor_applications")
      .select("id, user_id, offering_id, commitment_cents, funding_status")
      .order("updated_at", { ascending: false });
    if (offeringIds) appQuery = appQuery.in("offering_id", offeringIds);

    const { data: apps, error } = await appQuery;
    if (error) throw new Error(error.message);
    const applications = (apps ?? []) as any[];
    if (applications.length === 0) return { rows: [] as ClosingCandidate[] };

    const appIds = applications.map((a) => a.id as string);
    const userIds = Array.from(new Set(applications.map((a) => a.user_id as string)));
    const fundIds = Array.from(new Set(applications.map((a) => a.offering_id as string)));

    const [{ data: payments }, { data: profiles }, { data: offerings }, { data: closings }] =
      await Promise.all([
        supabase
          .from("payments")
          .select("application_id, amount_cents, status")
          .in("application_id", appIds),
        supabase.from("profiles").select("user_id, legal_name, email").in("user_id", userIds),
        supabase.from("offerings").select("id, name").in("id", fundIds),
        supabase
          .from("application_closings")
          .select("id, application_id, closing_date, funded_amount_cents, note, closed_at")
          .in("application_id", appIds),
      ]);

    const closingIds = ((closings ?? []) as any[]).map((c) => c.id as string);
    const docCounts = new Map<string, number>();
    if (closingIds.length) {
      const { data: docs } = await supabase
        .from("closing_documents")
        .select("closing_id")
        .in("closing_id", closingIds);
      for (const d of ((docs ?? []) as any[])) {
        docCounts.set(d.closing_id, (docCounts.get(d.closing_id) ?? 0) + 1);
      }
    }

    const received = new Map<string, number>();
    for (const p of ((payments ?? []) as any[])) {
      if (p.status !== "settled") continue;
      received.set(p.application_id, (received.get(p.application_id) ?? 0) + Number(p.amount_cents ?? 0));
    }

    const profileOf = new Map(((profiles ?? []) as any[]).map((p) => [p.user_id, p]));
    const fundOf = new Map(((offerings ?? []) as any[]).map((o) => [o.id, o.name as string]));
    const closingOf = new Map(((closings ?? []) as any[]).map((c) => [c.application_id, c]));

    const rows: ClosingCandidate[] = applications.map((a) => {
      const profile = profileOf.get(a.user_id);
      const closing = closingOf.get(a.id);
      return {
        applicationId: a.id,
        offeringId: a.offering_id,
        offeringName: fundOf.get(a.offering_id) ?? "Fund",
        investorName: profile?.legal_name ?? profile?.email ?? "Investor",
        investorEmail: profile?.email ?? null,
        commitmentCents: Number(a.commitment_cents ?? 0),
        receivedCents: received.get(a.id) ?? 0,
        fundingStatus: a.funding_status as string,
        closing: closing
          ? {
              id: closing.id,
              closingDate: closing.closing_date,
              fundedAmountCents: Number(closing.funded_amount_cents ?? 0),
              note: closing.note ?? null,
              closedAt: closing.closed_at,
              documentCount: docCounts.get(closing.id) ?? 0,
            }
          : null,
      };
    });

    return { rows };
  });

/** Confirms the commitment is fully funded and stamps the closing date. */
export const confirmClosing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        application_id: z.string().uuid(),
        funded_amount_cents: z.number().int().positive(),
        closing_date: z.string().min(8).max(10),
        note: z.string().max(1000).optional().nullable(),
        notify_investor: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: app } = await supabase
      .from("investor_applications")
      .select("id, user_id, offering_id, commitment_cents")
      .eq("id", data.application_id)
      .maybeSingle();
    if (!app) throw new Error("That investor was not found.");
    if (!(await canManage(supabase, app.offering_id))) {
      throw new Error("You do not have permission to close this investor.");
    }

    const note = data.note?.trim() ? data.note.trim() : null;
    const { data: saved, error } = await supabase
      .from("application_closings")
      .upsert(
        {
          application_id: app.id,
          offering_id: app.offering_id,
          funded_amount_cents: data.funded_amount_cents,
          closing_date: data.closing_date,
          status: "closed",
          note,
          closed_by: userId,
          closed_at: new Date().toISOString(),
        },
        { onConflict: "application_id" },
      )
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await supabase
      .from("investor_applications")
      .update({ status: "closed", funding_status: "settled", updated_at: new Date().toISOString() })
      .eq("id", app.id);

    const activity = await import("@/lib/reviewer-activity.server");
    await activity.logReviewerActivity(supabase, {
      actorId: userId,
      applicationId: app.id,
      offeringId: app.offering_id,
      action: "closing_confirmed",
      area: "closing",
      outcome: "approved",
      summary: `Closed on ${data.closing_date} — fully funded`,
      note,
      metadata: { funded_amount_cents: data.funded_amount_cents },
    });

    // The investor's capital account statement is produced as soon as they
    // close. A problem here must never undo the closing itself.
    try {
      const statements = await import("@/lib/capital-statements.server");
      await statements.assertStatementsInScope(supabase, app.offering_id);
      const made = await statements.generateStatement(supabase, app.id, userId);
      if (made) {
        await activity.logReviewerActivity(supabase, {
          actorId: userId,
          applicationId: app.id,
          offeringId: app.offering_id,
          action: "capital_statement_generated",
          area: "reporting",
          outcome: "completed",
          summary: `Capital account statement v${made.version} produced at closing`,
          note: null,
          metadata: { statement_id: made.id, version: made.version },
        });
      }
    } catch (e) {
      console.error("[closing] capital account statement not produced", e);
    }

    if (data.notify_investor !== false) {
      try {
        const [{ data: profile }, { data: offering }] = await Promise.all([
          supabase.from("profiles").select("legal_name, email").eq("user_id", app.user_id).maybeSingle(),
          supabase.from("offerings").select("name").eq("id", app.offering_id).maybeSingle(),
        ]);
        if (profile?.email) {
          const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
          const amount = new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: 0,
          }).format(data.funded_amount_cents / 100);
          await sendTemplateEmail("investor-message", profile.email, {
            templateData: {
              investorName: profile.legal_name ?? "Investor",
              subject: `Your investment has closed — ${offering?.name ?? "your fund"}`,
              offeringName: offering?.name ?? "your fund",
              body: `We have received your funds in full and your investment closed on ${data.closing_date}.\n\nAmount received: ${amount}\n\nYour closing date and final documents are now in your portal at https://onboard.harmonious.co/dashboard.${
                note ? `\n\nNote from the team: ${note}` : ""
              }`,
            },
            idempotencyKey: `closing-${saved.id}-${data.closing_date}`,
          });
        }
      } catch (e) {
        console.error("[closing] investor email failed", e);
      }
    }

    return { ok: true, id: saved.id as string };
  });

/** Reverses a closing when it was confirmed too early. */
export const reopenClosing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ application_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("application_closings")
      .select("id, offering_id")
      .eq("application_id", data.application_id)
      .maybeSingle();
    if (!row) throw new Error("There is no closing to reopen.");
    if (!(await canManage(supabase, row.offering_id))) {
      throw new Error("You do not have permission to change this closing.");
    }

    const { error } = await supabase.from("application_closings").delete().eq("id", row.id);
    if (error) throw new Error(error.message);

    await supabase
      .from("investor_applications")
      .update({ status: "in_progress", updated_at: new Date().toISOString() })
      .eq("id", data.application_id);

    const activity = await import("@/lib/reviewer-activity.server");
    await activity.logReviewerActivity(supabase, {
      actorId: userId,
      applicationId: data.application_id,
      offeringId: row.offering_id,
      action: "closing_reopened",
      area: "closing",
      outcome: "delayed",
      summary: "Closing reopened",
    });

    return { ok: true };
  });

/** Final documents attached to a closing (managers see any, investors their own). */
export const listClosingDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ application_id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: docs, error } = await supabase
      .from("closing_documents")
      .select("id, title, file_name, size_bytes, uploaded_at")
      .eq("application_id", data.application_id)
      .order("uploaded_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { documents: (docs ?? []) as any[] };
  });

export const addClosingDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        application_id: z.string().uuid(),
        title: z.string().min(1).max(200),
        file_name: z.string().min(1).max(255),
        storage_path: z.string().min(1).max(500),
        size_bytes: z.number().int().nonnegative().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: closing } = await supabase
      .from("application_closings")
      .select("id, offering_id")
      .eq("application_id", data.application_id)
      .maybeSingle();
    if (!closing) throw new Error("Confirm the closing first, then add the documents.");
    if (!(await canManage(supabase, closing.offering_id))) {
      throw new Error("You do not have permission to add documents to this closing.");
    }
    if (!data.storage_path.startsWith(`${closing.offering_id}/${data.application_id}/`)) {
      throw new Error("Invalid file location.");
    }

    const { error } = await supabase.from("closing_documents").insert({
      closing_id: closing.id,
      application_id: data.application_id,
      offering_id: closing.offering_id,
      title: data.title.trim(),
      file_name: data.file_name,
      storage_path: data.storage_path,
      size_bytes: data.size_bytes ?? null,
      uploaded_by: userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeClosingDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: doc } = await supabase
      .from("closing_documents")
      .select("id, offering_id, storage_path")
      .eq("id", data.id)
      .maybeSingle();
    if (!doc) throw new Error("That document was not found.");
    if (!(await canManage(supabase, doc.offering_id))) {
      throw new Error("You do not have permission to remove this document.");
    }
    await supabase.storage.from("closing-documents").remove([doc.storage_path]);
    const { error } = await supabase.from("closing_documents").delete().eq("id", doc.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Short-lived download link; row access is already scoped by the access rules. */
export const getClosingDocumentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: doc } = await supabase
      .from("closing_documents")
      .select("storage_path")
      .eq("id", data.id)
      .maybeSingle();
    if (!doc) throw new Error("That file is not available.");
    const { data: signed, error } = await supabase.storage
      .from("closing-documents")
      .createSignedUrl(doc.storage_path, 300);
    if (error || !signed) throw new Error(error?.message ?? "Could not open that file.");
    return { url: signed.signedUrl };
  });

/** What the investor sees: their closing date and final documents. */
export const getMyClosing = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: app } = await supabase
      .from("investor_applications")
      .select("id, offering_id, commitment_cents")
      .eq("user_id", userId)
      .eq("id", await activeApplicationId(supabase, userId))
      .maybeSingle();
    if (!app) return { closing: null, documents: [] as any[] };

    const [{ data: closing }, { data: offering }] = await Promise.all([
      supabase
        .from("application_closings")
        .select("id, closing_date, funded_amount_cents, note, closed_at")
        .eq("application_id", app.id)
        .maybeSingle(),
      supabase.from("offerings").select("name").eq("id", app.offering_id).maybeSingle(),
    ]);

    if (!closing) return { closing: null, documents: [] as any[] };

    const { data: docs } = await supabase
      .from("closing_documents")
      .select("id, title, file_name, size_bytes, uploaded_at")
      .eq("application_id", app.id)
      .order("uploaded_at", { ascending: false });

    return {
      closing: {
        applicationId: app.id as string,
        closingDate: closing.closing_date as string,
        fundedAmountCents: Number(closing.funded_amount_cents ?? 0),
        note: (closing.note as string | null) ?? null,
        closedAt: closing.closed_at as string,
        offeringName: (offering as any)?.name ?? "your fund",
      },
      documents: (docs ?? []) as any[],
    };
  });
