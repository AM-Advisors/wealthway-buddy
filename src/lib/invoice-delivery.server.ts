import { listEmailLogs } from "@lovable.dev/email-js";

export interface DeliveryRow {
  email: string;
  name: string;
  /** sent | rejected | bounced | complained | unsubscribed | suppressed | rate_limited | unknown */
  state: string;
  at: string | null;
  detail: string | null;
}

const FAILED = new Set(["rejected", "bounced", "complained", "unsubscribed", "suppressed", "rate_limited"]);

/** Contacts who receive invoice email for a client, mirroring client-notify. */
export async function invoiceRecipients(clientId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const roles = ["client_gp", "client_signatory", "client_finance", "client_legal", "client_compliance"];

  const { data: members } = await supabaseAdmin
    .from("client_users")
    .select("user_id, client_role, can_approve")
    .eq("client_id", clientId);

  const wanted = (members ?? []).filter(
    (m: any) => roles.includes(String(m.client_role)) || m.can_approve === true,
  );
  if (!wanted.length) return [] as { email: string; name: string }[];

  const ids = Array.from(new Set(wanted.map((m: any) => String(m.user_id))));
  const { data: people } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email")
    .in("id", ids);

  const seen = new Set<string>();
  const out: { email: string; name: string }[] = [];
  for (const p of (people ?? []) as any[]) {
    const email = String(p.email ?? "").trim();
    if (!email || seen.has(email.toLowerCase())) continue;
    seen.add(email.toLowerCase());
    out.push({ email, name: String(p.full_name ?? "").trim() || email });
  }
  return out;
}

/**
 * What actually happened to an invoice's email, per recipient. Read-only:
 * pulls Lovable's delivery events and matches them to the people who should
 * have received it. Never throws — a logging outage must not break the board.
 */
export async function invoiceDelivery(
  clientId: string,
  issuedAt: string | null,
): Promise<{ rows: DeliveryRow[]; confirmed: boolean; problem: boolean; available: boolean }> {
  const recipients = await invoiceRecipients(clientId);
  if (!recipients.length) {
    return { rows: [], confirmed: false, problem: true, available: true };
  }

  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) {
    return {
      rows: recipients.map((r) => ({ ...r, state: "unknown", at: null, detail: null })),
      confirmed: false,
      problem: false,
      available: false,
    };
  }

  const since = issuedAt
    ? new Date(Date.parse(issuedAt) - 60 * 60 * 1000).toISOString()
    : new Date(Date.now() - 90 * 86_400_000).toISOString();

  const rows: DeliveryRow[] = [];
  let available = true;

  for (const person of recipients) {
    try {
      const logs = await listEmailLogs(
        { recipient: person.email, since, limit: 50 },
        { apiKey },
      );
      const relevant = (logs.data ?? []).filter((e) =>
        (e.tags ?? []).some((t) => String(t).startsWith("invoice-")),
      );
      const latest = relevant.length ? relevant : (logs.data ?? []);
      const failure = latest.find((e) => FAILED.has(e.event_type));
      const success = latest.find((e) => e.event_type === "sent");
      const chosen = failure ?? success ?? null;

      rows.push({
        ...person,
        state: chosen ? chosen.event_type : "unknown",
        at: chosen ? chosen.timestamp : null,
        detail: chosen?.status ?? null,
      });
    } catch (err) {
      console.error("[invoice-delivery] log read failed", person.email, err);
      available = false;
      rows.push({ ...person, state: "unknown", at: null, detail: null });
    }
  }

  const confirmed = rows.some((r) => r.state === "sent");
  const problem = rows.some((r) => FAILED.has(r.state)) || (available && !confirmed);
  return { rows, confirmed, problem, available };
}
