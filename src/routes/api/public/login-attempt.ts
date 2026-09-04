import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const schema = z.object({
  email: z.string().trim().email().max(200),
  success: z.boolean(),
  reason: z.string().trim().max(300).optional(),
});

// Simple in-memory throttle per IP (best effort; workers are stateless).
const recent = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;

function throttled(ip: string) {
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  recent.set(ip, hits);
  return hits.length > MAX_PER_WINDOW;
}

export const Route = createFileRoute("/api/public/login-attempt")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let parsed;
        try {
          parsed = schema.parse(await request.json());
        } catch {
          return new Response("Invalid payload", { status: 400 });
        }

        const ip =
          request.headers.get("cf-connecting-ip") ??
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          null;
        if (ip && throttled(ip)) return new Response("Too many requests", { status: 429 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        let userId: string | null = null;
        if (parsed.success) {
          const { data } = await supabaseAdmin
            .from("profiles")
            .select("user_id")
            .ilike("email", parsed.email)
            .maybeSingle();
          userId = (data as any)?.user_id ?? null;
        }

        await supabaseAdmin.from("login_attempts").insert({
          email: parsed.email.toLowerCase(),
          user_id: userId,
          success: parsed.success,
          failure_reason: parsed.success ? null : (parsed.reason ?? "Sign-in failed"),
          ip_address: ip,
          user_agent: request.headers.get("user-agent")?.slice(0, 400) ?? null,
        });

        return new Response("ok");
      },
    },
  },
});
