import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

/**
 * Outstanding bookkeeping items for one fund: what the client needs to provide and what
 * Harmonious is working on. Readable by staff, the fund's managers and its client members
 * (assertFund); never investors. Reads only; requests are client-visible staff tasks.
 */
export const getBookkeepingOutstanding = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ fundId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { assertFund } = await import("@/lib/fund-tabs.server");
    const access = await assertFund(context.userId, data.fundId);
    const db = (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
    const [uploads, lines, info, exceptions, checklist, requests] = await Promise.all([
      db.from("bank_statement_uploads").select("period_start, period_end, bank_name, account_mask, status").eq("offering_id", data.fundId).limit(500),
      db.from("bank_statement_lines").select("id, posted_on, description, amount_cents, direction, skip, duplicate_of, confirmed_category, matched_onboarding_id, matched_asset_id, matched_vendor, applied_tx_id").eq("offering_id", data.fundId).limit(2000),
      db.from("bank_reconciliations").select("id, information_request, information_requested_at").eq("offering_id", data.fundId).not("information_requested_at", "is", null).is("reconciled_at", null).limit(200),
      db.from("accounting_exceptions").select("id, kind, opened_at").eq("offering_id", data.fundId).in("status", ["open", "investigating"]).limit(500),
      db.from("close_checklist_items").select("period_end, label, blocking, status").eq("offering_id", data.fundId).limit(1000),
      db.from("staff_tasks").select("id, title, requested_information, responsibility_status, responsibility_note_client, due_date, created_at, status").eq("offering_id", data.fundId).eq("related_workflow_type", "bookkeeping_review").eq("client_visibility", true).limit(200),
    ]);
    const failed = [uploads, lines, info, exceptions, checklist, requests].find((r) => r.error);
    if (failed) throw new Error("Couldn't load outstanding bookkeeping items. Please try again.");
    const { buildOutstandingItems, outstandingSummary } = await import("@/lib/bookkeeping-outstanding-model");
    const items = buildOutstandingItems({
      asOf: new Date().toISOString().slice(0, 10), uploads: uploads.data ?? [], lines: lines.data ?? [], infoRequests: info.data ?? [],
      exceptions: exceptions.data ?? [], checklist: checklist.data ?? [], reviewRequests: requests.data ?? [],
    });
    return { staff: access.staff, items, summary: outstandingSummary(items), generatedAt: new Date().toISOString() };
  });

export const requestBookkeepingItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({
    fundId: z.string().uuid(), title: z.string().trim().min(3).max(200), detail: z.string().trim().min(3).max(2000),
    dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  }).parse(d))
  .handler(async ({ context, data }) => (await import("@/lib/staff-tasks.server")).createBookkeepingReviewRequest(context.userId, data));

export const markBookkeepingItemProvided = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d) => z.object({ fundId: z.string().uuid(), requestId: z.string().uuid(), note: z.string().max(2000).default("") }).parse(d))
  .handler(async ({ context, data }) => (await import("@/lib/staff-tasks.server")).markBookkeepingRequestProvided(context.userId, data));
