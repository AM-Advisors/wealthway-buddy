import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/** Public intake for founders asking to move their cap table to Harmonious.
 *
 *  It only ever records the request. It never reveals whether the company or
 *  the person is already known to Harmonious, and it never creates an account:
 *  the Harmonious team sends the portal invitation by hand. */

const schema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255),
  companyName: z.string().trim().min(2).max(160),
  sourceProvider: z.enum(["carta", "pulley", "angellist", "spreadsheet", "none", "other"]),
  shareholderCount: z.number().int().min(0).max(1000000).nullable().optional(),
  note: z.string().trim().max(1000).optional(),
  authority: z.literal(true),
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
} as const;

/** Same answer whatever happens, so nobody can probe for existing clients. */
function received() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json", ...CORS },
  });
}

export const Route = createFileRoute("/api/public/cap-table-request")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let parsed: z.infer<typeof schema>;
        try {
          parsed = schema.parse(await request.json());
        } catch {
          return new Response(JSON.stringify({ ok: false, error: "Please check the details and try again." }), {
            status: 400,
            headers: { "content-type": "application/json", ...CORS },
          });
        }

        const email = parsed.email.toLowerCase();
        const ip =
          request.headers.get("cf-connecting-ip") ??
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          null;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        // Throttle: three requests per address per day, twenty per address block.
        const { count: byEmail } = await supabaseAdmin
          .from("cap_table_leads")
          .select("id", { count: "exact", head: true })
          .ilike("email", email)
          .gte("created_at", since);
        if ((byEmail ?? 0) >= 3) return received();

        if (ip) {
          const { count: byIp } = await supabaseAdmin
            .from("cap_table_leads")
            .select("id", { count: "exact", head: true })
            .eq("submitted_ip", ip)
            .gte("created_at", since);
          if ((byIp ?? 0) >= 20) return received();
        }

        await supabaseAdmin.from("cap_table_leads").insert({
          full_name: parsed.fullName,
          email,
          company_name: parsed.companyName,
          source_provider: parsed.sourceProvider,
          shareholder_count: parsed.shareholderCount ?? null,
          note: parsed.note || null,
          submitted_ip: ip,
        });

        return received();
      },
    },
  },
});
