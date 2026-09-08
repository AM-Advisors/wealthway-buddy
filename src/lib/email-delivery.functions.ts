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

export type DeliveryDetails = {
  recipient: string;
  headers: { label: string; value: string }[];
  lastResponse: {
    event: string;
    at: string | null;
    status: string | null;
    smtpResponse: string | null;
  } | null;
  rawPayload: string | null;
  error: string | null;
};

const detailsSchema = z.object({
  recipient: z.string().trim().email().max(255),
  applicationId: z.string().uuid().optional(),
});

function pickSmtpResponse(payload: any): string | null {
  if (!payload || typeof payload !== "object") return null;
  const keys = [
    "smtp_response",
    "diagnostic_code",
    "response",
    "reason",
    "description",
    "detail",
    "message",
    "error",
  ];
  const scan = (obj: any, depth: number): string | null => {
    if (!obj || typeof obj !== "object" || depth > 3) return null;
    for (const k of keys) {
      const v = obj[k];
      if (typeof v === "string" && v.trim().length > 0) return v.trim();
    }
    for (const v of Object.values(obj)) {
      const found = scan(v, depth + 1);
      if (found) return found;
    }
    return null;
  };
  return scan(payload, 0);
}

/** Last-known provider response and message headers for a recipient's most recent onboarding email. */
export const getDeliveryDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => detailsSchema.parse(data))
  .handler(async ({ data, context }): Promise<DeliveryDetails> => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let emailQuery = supabaseAdmin
      .from("investor_emails")
      .select(
        "id, to_email, subject, status, provider_error, created_at, updated_at, delivery_event, delivery_event_at, delivery_detail",
      )
      .eq("to_email", data.recipient)
      .order("created_at", { ascending: false })
      .limit(1);
    if (data.applicationId) emailQuery = emailQuery.eq("application_id", data.applicationId);

    const [{ data: emailRows }, { data: eventRows }] = await Promise.all([
      emailQuery,
      supabaseAdmin
        .from("email_delivery_events")
        .select("event_type, recipient, message_id, payload, received_at")
        .eq("recipient", data.recipient)
        .order("received_at", { ascending: false })
        .limit(1),
    ]);

    const sent: any = emailRows?.[0] ?? null;
    const event: any = eventRows?.[0] ?? null;

    let logEvent: { event_type: string; status?: string; message_id?: string; timestamp: string } | null = null;
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (apiKey) {
      try {
        const { listEmailLogs } = await import("@lovable.dev/email-js");
        const result = await listEmailLogs({ recipient: data.recipient, limit: 5 }, { apiKey });
        logEvent = (result.data ?? [])[0] ?? null;
      } catch (error) {
        console.error("Delivery detail log lookup failed", error);
      }
    }

    const messageId = event?.message_id ?? logEvent?.message_id ?? null;
    const headers: { label: string; value: string }[] = [
      { label: "To", value: data.recipient },
      { label: "From", value: "Harmonious <noreply@onboarding.harmonious.co>" },
      { label: "Sender domain", value: "notify.onboarding.harmonious.co" },
      { label: "Subject", value: sent?.subject ?? "—" },
      { label: "Message-ID", value: messageId ?? "—" },
      {
        label: "Date",
        value: sent?.created_at ? new Date(sent.created_at).toISOString() : "—",
      },
      { label: "Purpose", value: "transactional" },
    ];

    const smtpResponse =
      pickSmtpResponse(event?.payload) ??
      (typeof sent?.delivery_detail === "string" ? sent.delivery_detail : null) ??
      (typeof sent?.provider_error === "string" ? sent.provider_error : null) ??
      logEvent?.status ??
      null;

    const lastResponse =
      event || logEvent || sent
        ? {
            event: event?.event_type ?? logEvent?.event_type ?? sent?.status ?? "unknown",
            at:
              event?.received_at ??
              logEvent?.timestamp ??
              sent?.delivery_event_at ??
              sent?.updated_at ??
              null,
            status: logEvent?.status ?? sent?.status ?? null,
            smtpResponse,
          }
        : null;

    return {
      recipient: data.recipient,
      headers,
      lastResponse,
      rawPayload: event?.payload ? JSON.stringify(event.payload, null, 2).slice(0, 4000) : null,
      error: null,
    };
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
