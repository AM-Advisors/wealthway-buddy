import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/require-auth";

/** Staff-only list of sent reminders with delivery, open, click and in-portal read tracking. */
export const listReminderTracking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ days: z.number().int().min(1).max(365) }).parse(d))
  .handler(async ({ data, context }) => {
    const { assertOpsStaff } = await import("@/lib/fund-manager-profile.server");
    await assertOpsStaff(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const d = supabaseAdmin as any;
    const since = new Date(Date.now() - data.days * 86400_000).toISOString();
    const { data: rows, error } = await d.from("document_reminders")
      .select("id, created_at, document_title, recipient_email, offering_id, client_id, sent_by, delivered, message_id, inbox_message_id, delivered_at, bounced_at, bounce_reason, first_opened_at, open_count, first_clicked_at, click_count")
      .gte("created_at", since).order("created_at", { ascending: false }).limit(1000);
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as any[];
    const inboxIds = list.map((r) => r.inbox_message_id).filter(Boolean);
    const offIds = [...new Set(list.map((r) => r.offering_id).filter(Boolean))];
    const senderIds = [...new Set(list.map((r) => r.sent_by).filter(Boolean))];
    const [inbox, offs, senders] = await Promise.all([
      inboxIds.length ? d.from("client_messages").select("id, read_at").in("id", inboxIds) : { data: [] },
      offIds.length ? d.from("offerings").select("id, name").in("id", offIds) : { data: [] },
      senderIds.length ? d.from("profiles").select("user_id, legal_name").in("user_id", senderIds) : { data: [] },
    ]);
    const readMap = new Map(((inbox.data ?? []) as any[]).map((m) => [m.id, m.read_at]));
    const offMap = new Map(((offs.data ?? []) as any[]).map((o) => [o.id, o.name]));
    const sendMap = new Map(((senders.data ?? []) as any[]).map((p) => [p.user_id, p.legal_name]));
    return {
      reminders: list.map((r) => ({
        id: r.id, createdAt: r.created_at, document: r.document_title, recipient: r.recipient_email,
        fund: r.offering_id ? offMap.get(r.offering_id) ?? null : null, sentBy: sendMap.get(r.sent_by) ?? null,
        accepted: r.delivered, tracked: !!r.message_id,
        deliveredAt: r.delivered_at, bouncedAt: r.bounced_at, bounceReason: r.bounce_reason,
        firstOpenedAt: r.first_opened_at, openCount: r.open_count ?? 0,
        firstClickedAt: r.first_clicked_at, clickCount: r.click_count ?? 0,
        inInbox: !!r.inbox_message_id, readInPortalAt: r.inbox_message_id ? readMap.get(r.inbox_message_id) ?? null : null,
      })),
    };
  });
