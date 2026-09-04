import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  recipient: z.string().trim().email().max(255).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Admins only.");
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
