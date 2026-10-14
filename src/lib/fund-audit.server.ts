import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SECRET = /account|routing|swift|iban|tin|ssn|ein|tax_id/i;
const label = (k: string) => k.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** Append one entry to a fund's audit history. Best-effort: never blocks the action it records. */
export async function logFundAudit(userId: string, input: { offeringId: string; eventType: string; summary: string; values?: Record<string, unknown> }) {
  try {
    const d = supabaseAdmin as any;
    const { data: p } = await d.from("profiles").select("email,full_name").eq("id", userId).maybeSingle();
    const changes = Object.entries(input.values ?? {})
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => {
        const t = v == null || v === "" ? "(cleared)" : String(v);
        return { field: label(k), to: SECRET.test(k) && t.length > 4 ? `••${t.slice(-4)}` : t.slice(0, 300) };
      });
    await d.from("offering_audit_events").insert({
      offering_id: input.offeringId, event_type: input.eventType, summary: input.summary.slice(0, 500), changes,
      actor_id: userId, actor_email: p?.email ?? null, actor_name: p?.full_name ?? null,
    });
  } catch { /* history logging must not stop the save */ }
}
