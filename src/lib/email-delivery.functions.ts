import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  recipient: z.string().trim().email().max(255).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "fund_manager"]);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Reviewers only.");
}


export type DeliveryLogEvent = {
  timestamp: string;
  recipient: string;
  event_type: string;
  status?: string | undefined;
  message_id?: string | undefined;
};

/** Delivery history for onboarding emails: sends, rejections, bounces, complaints, unsubscribes. */
export const listDeliveryLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => schema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) {
      return { events: [] as DeliveryLogEvent[], historyStartsAt: null as string | null, error: "Email delivery history is not available yet." };
    }

    try {
      const { listEmailLogs } = await import("@lovable.dev/email-js");
      const result = await listEmailLogs(
        {
          ...(data.recipient ? { recipient: data.recipient } : {}),
          limit: data.limit ?? 50,
        },
        { apiKey },
      );
      return {
        events: (result.data ?? []).map((e) => ({
          timestamp: e.timestamp,
          recipient: e.recipient,
          event_type: e.event_type,
          status: e.status,
          message_id: e.message_id,
        })) as DeliveryLogEvent[],
        historyStartsAt: result.history_starts_at ?? null,
        error: null as string | null,
      };
    } catch (error) {
      console.error("Email log lookup failed", error);
      return {
        events: [] as DeliveryLogEvent[],
        historyStartsAt: null as string | null,
        error: "Could not load delivery history right now.",
      };
    }
  });

export type EmailClickEvent = {
  id: string;
  recipient: string;
  template: string | null;
  linkLabel: string | null;
  targetUrl: string;
  clickedAt: string;
};

const clickSchema = z.object({
  recipient: z.string().trim().email().max(255).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

/** Recorded clicks on links inside onboarding emails (admins and fund managers). */
export const listEmailClicks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => clickSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = supabaseAdmin
      .from("email_link_clicks")
      .select("id, recipient, template, link_label, target_url, clicked_at")
      .order("clicked_at", { ascending: false })
      .limit(data.limit ?? 25);
    if (data.recipient) query = query.eq("recipient", data.recipient);

    const { data: rows, error } = await query;
    if (error) {
      console.error("Email click lookup failed", error);
      return { clicks: [] as EmailClickEvent[], error: "Could not load click activity right now." };
    }

    return {
      clicks: (rows ?? []).map((r: any) => ({
        id: r.id as string,
        recipient: r.recipient as string,
        template: r.template ?? null,
        linkLabel: r.link_label ?? null,
        targetUrl: r.target_url as string,
        clickedAt: r.clicked_at as string,
      })) as EmailClickEvent[],
      error: null as string | null,
    };
  });
