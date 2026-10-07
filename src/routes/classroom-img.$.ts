import { createFileRoute } from "@tanstack/react-router";

/** Serves Classroom hero images (non-sensitive marketing art) from the private bucket. */
export const Route = createFileRoute("/classroom-img/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const path = params._splat ?? "";
        if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg)$/.test(path)) return new Response("Not found", { status: 404 });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await (supabaseAdmin as any).storage.from("classroom-images").download(path);
        if (error || !data) return new Response("Not found", { status: 404 });
        return new Response(data, { headers: { "Content-Type": path.endsWith(".jpg") ? "image/jpeg" : "image/png", "Cache-Control": "public, max-age=31536000, immutable" } });
      },
    },
  },
});
