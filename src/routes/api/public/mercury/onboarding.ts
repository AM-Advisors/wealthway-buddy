import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";
import { z } from "zod";

function safeEq(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const Route = createFileRoute("/api/public/mercury/onboarding")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const secret = process.env["MERCURY_WEBHOOK_SECRET"];
        const token = url.searchParams.get("token") ?? "";
        if (!secret || !safeEq(token, secret)) return new Response("Unauthorized", { status: 401 });
        const requestId = z.string().uuid().safeParse(url.searchParams.get("request"));
        if (!requestId.success) return new Response("Bad request", { status: 400 });
        let body: any = {};
        try { body = await request.json(); } catch { /* empty */ }
        const raw = String(body?.status ?? body?.applicationStatus ?? body?.event ?? body?.type ?? "updated").slice(0, 120);
        const { recordMercuryStatus } = await import("@/lib/mercury-onboarding.server");
        const ok = await recordMercuryStatus(requestId.data, raw);
        return new Response(ok ? "ok" : "not found", { status: ok ? 200 : 404 });
      },
    },
  },
});
