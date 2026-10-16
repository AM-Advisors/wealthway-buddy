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

        // A successful sign-in is only recorded when the caller proves it with
        // their own fresh session token for that same email address.
        let userId: string | null = null;
        if (parsed.success) {
          const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
          if (!token) return new Response("Unauthorized", { status: 401 });
          const { data: auth, error: authError } = await supabaseAdmin.auth.getUser(token);
          const authEmail = auth?.user?.email?.toLowerCase();
          if (authError || !auth?.user || authEmail !== parsed.email.toLowerCase()) {
            return new Response("Unauthorized", { status: 401 });
          }
          userId = auth.user.id;
        }

        await supabaseAdmin.from("login_attempts").insert({
          email: parsed.email.toLowerCase(),
          user_id: userId,
          success: parsed.success,
          failure_reason: parsed.success ? null : `Reported by sign-in page (unverified): ${parsed.reason ?? "Sign-in failed"}`.slice(0, 300),
          ip_address: ip,
          user_agent: request.headers.get("user-agent")?.slice(0, 400) ?? null,
        });

        return new Response("ok");
      },
    },
  },
});
