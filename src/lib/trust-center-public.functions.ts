import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

/** Public Trust Center reads: published, non-internal items only (RLS enforces the same). */
function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export type PublicTrustItem = { id: string; item_type: "assurance" | "section" | "document"; item_key: string; title: string; body: string; framework_key: string | null; assurance_status: string | null; access_level: string; published_at: string | null };

export const getPublishedTrustItems = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { data } = await publicClient().from("trust_publications")
      .select("id, item_type, item_key, title, body, framework_key, assurance_status, access_level, published_at")
      .eq("state", "published").neq("access_level", "internal").order("sort");
    return { items: (data ?? []) as PublicTrustItem[] };
  } catch {
    return { items: [] as PublicTrustItem[] };
  }
});

export const requestTrustDocument = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    publication_id: z.string().uuid(), requester_name: z.string().trim().min(1).max(120), requester_email: z.string().trim().email().max(200),
    company: z.string().trim().max(160), reason: z.string().trim().max(1000),
  }).parse(d))
  .handler(async ({ data }) => {
    // A request never grants access; Harmonious reviews each one.
    const { error } = await publicClient().from("trust_document_requests").insert({ ...data, status: "received" });
    if (error) throw new Error("This document can't be requested right now.");
    return { ok: true };
  });
