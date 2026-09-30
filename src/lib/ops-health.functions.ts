import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Read-only health views for Harmonious admins. No payloads, masked addresses. */
function mask(email: string | null | undefined) {
  if (!email) return "";
  const [user = "", domain = ""] = email.split("@");
  return `${user.slice(0, 2)}${"•".repeat(Math.max(1, user.length - 2))}@${domain}`;
}
const trim = (s: string | null | undefined) => (s ? s.slice(0, 160) : null);

async function admin(userId: string) {
  const { assertStaff } = await import("@/lib/investor-onboarding.server");
  await assertStaff(userId);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

const since = z.object({ days: z.number().int().min(1).max(90).default(14) });

export const emailHealthFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => since.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const db = await admin(context.userId);
    const from = new Date(Date.now() - data.days * 864e5).toISOString();
    const { data: rows } = await db
      .from("email_delivery_events")
      .select("event_id, event_type, recipient, message_id, received_at")
      .gte("received_at", from)
      .order("received_at", { ascending: false })
      .limit(1000);
    const list = ((rows ?? []) as any[]).map((r) => ({
      id: r.event_id as string, type: String(r.event_type), recipient: mask(r.recipient),
      messageId: r.message_id ? String(r.message_id).slice(0, 12) : null, at: r.received_at as string,
    }));
    const counts: Record<string, number> = {};
    for (const r of list) counts[r.type] = (counts[r.type] ?? 0) + 1;
    return { counts, events: list };
  });

export const webhookLogFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => since.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const db = await admin(context.userId);
    const from = new Date(Date.now() - data.days * 864e5).toISOString();
    const [didit, box, plaid] = await Promise.all([
      db.from("didit_webhook_events").select("event_id, webhook_type, status, error, received_at, processed_at").gte("received_at", from).order("received_at", { ascending: false }).limit(300),
      db.from("box_sign_webhook_events").select("id, trigger, outcome, received_at, processed_at").gte("received_at", from).order("received_at", { ascending: false }).limit(300),
      db.from("plaid_webhook_deliveries").select("id, webhook_type, webhook_code, status, detail, attempts, received_at, processed_at").gte("received_at", from).order("received_at", { ascending: false }).limit(300),
    ]);
    const events = [
      ...((didit.data ?? []) as any[]).map((r) => ({ id: `d-${r.event_id}`, source: "Identity check", kind: r.webhook_type, status: r.status ?? (r.processed_at ? "processed" : "received"), detail: trim(r.error), at: r.received_at, processedAt: r.processed_at })),
      ...((box.data ?? []) as any[]).map((r) => ({ id: `b-${r.id}`, source: "Box Sign", kind: r.trigger ?? "event", status: r.outcome ?? (r.processed_at ? "processed" : "received"), detail: null, at: r.received_at, processedAt: r.processed_at })),
      ...((plaid.data ?? []) as any[]).map((r) => ({ id: `p-${r.id}`, source: "Plaid", kind: `${r.webhook_type}/${r.webhook_code}`, status: r.status, detail: trim(r.detail), at: r.received_at, processedAt: r.processed_at, attempts: r.attempts })),
    ].sort((a, b) => String(b.at).localeCompare(String(a.at)));
    return { events };
  });

export const systemStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin(context.userId);
    const t0 = Date.now();
    const { error } = await db.from("offerings").select("id", { head: true, count: "exact" }).limit(1);
    return {
      app: "ok" as const,
      backend: error ? ("error" as const) : ("ok" as const),
      backendMs: Date.now() - t0,
      checkedAt: new Date().toISOString(),
    };
  });
