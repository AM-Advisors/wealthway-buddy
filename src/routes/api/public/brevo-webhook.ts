import { createFileRoute } from "@tanstack/react-router";

/**
 * Brevo transactional events (delivered, opened, click, bounces) for reminder emails.
 * Caller must present the shared bearer token. Only updates tracking counters; never sends or changes anything else.
 */
function timingSafeEq(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export const Route = createFileRoute("/api/public/brevo-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["BREVO_WEBHOOK_TOKEN"];
        const got = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
        if (!expected || !timingSafeEq(got, expected)) return new Response("Unauthorized", { status: 401 });
        let body: any;
        try { body = await request.json(); } catch { return new Response("Bad request", { status: 400 }); }
        const events = (Array.isArray(body) ? body : [body]).slice(0, 500);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const d = supabaseAdmin as any;
        for (const e of events) {
          const messageId = typeof e?.["message-id"] === "string" ? e["message-id"] : null;
          const ev = typeof e?.event === "string" ? e.event : null;
          if (!messageId || !ev) continue;
          const at = e.ts_event ? new Date(Number(e.ts_event) * 1000).toISOString() : new Date().toISOString();
          const dedupe = `${messageId}|${ev}|${e.ts_event ?? e.date ?? ""}|${e.link ?? ""}`;
          const { error } = await d.from("email_tracking_events").insert({ message_id: messageId, event: ev, occurred_at: at, dedupe_key: dedupe, reason: typeof e.reason === "string" ? e.reason.slice(0, 300) : null });
          if (error) continue; // duplicate delivery
          const { data: rows } = await d.from("document_reminders").select("id, delivered_at, first_opened_at, first_clicked_at, open_count, click_count").eq("message_id", messageId).limit(5);
          for (const r of (rows ?? []) as any[]) {
            const patch: Record<string, unknown> = {};
            if (ev === "delivered") patch.delivered_at = r.delivered_at ?? at;
            else if (ev === "opened" || ev === "unique_opened" || ev === "proxy_open") { patch.open_count = (r.open_count ?? 0) + 1; patch.first_opened_at = r.first_opened_at ?? at; }
            else if (ev === "click") { patch.click_count = (r.click_count ?? 0) + 1; patch.first_clicked_at = r.first_clicked_at ?? at; }
            else if (["hard_bounce", "soft_bounce", "blocked", "invalid_email", "spam", "error"].includes(ev)) { patch.bounced_at = at; patch.bounce_reason = `${ev.replace(/_/g, " ")}${e.reason ? `: ${String(e.reason).slice(0, 200)}` : ""}`; }
            if (Object.keys(patch).length) await d.from("document_reminders").update(patch).eq("id", r.id);
          }
        }
        return new Response("ok");
      },
    },
  },
});
