import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";

const Body = z.object({ submissionId: z.string().min(1).max(200), status: z.enum(["accepted", "rejected"]), detail: z.string().max(2000).nullish() });

export const Route = createFileRoute("/api/public/irs-efile/ack")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["IRS_EFILE_WEBHOOK_SECRET"];
        if (!secret) return new Response("Not configured", { status: 503 });
        const raw = await request.text();
        const sig = Buffer.from(request.headers.get("x-efile-signature") ?? "");
        const exp = Buffer.from(createHmac("sha256", secret).update(raw).digest("hex"));
        if (sig.length !== exp.length || !timingSafeEqual(sig, exp)) return new Response("Invalid signature", { status: 401 });
        const parsed = Body.safeParse(JSON.parse(raw || "{}"));
        if (!parsed.success) return new Response("Bad request", { status: 400 });
        const { recordEfileAck } = await import("@/lib/irs-efile.server");
        const ok = await recordEfileAck(parsed.data.submissionId, parsed.data.status, parsed.data.detail ?? null);
        return new Response(ok ? "ok" : "unknown submission", { status: ok ? 200 : 404 });
      },
    },
  },
});
