import { sendTemplateEmail } from "@/lib/email-templates/send-email";

/** Contact roles that run the engagement on the client's side. Read-only
 *  contacts are deliberately left out — they cannot act on any of these. */
const ADMIN_CLIENT_ROLES = [
  "client_gp",
  "client_signatory",
  "client_finance",
  "client_legal",
  "client_compliance",
];

const PORTAL_BASE = "https://onboard.harmonious.co";

export interface ClientAlert {
  headline: string;
  intro: string;
  details?: { label: string; value: string }[];
  actionLabel?: string;
  /** Path inside the portal, e.g. "/client/invoices". */
  actionPath?: string;
  /** Stops duplicate sends when the same event is retried. */
  eventKey: string;
}

type Recipient = { email: string; name: string };

/** Client administrators for one client, or for every client when clientId
 *  is null (used for platform-wide documents such as a new policy version). */
async function clientAdmins(clientId: string | null): Promise<Recipient[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let query = supabaseAdmin
    .from("client_users")
    .select("user_id, client_id, client_role, can_approve");
  if (clientId) query = query.eq("client_id", clientId);
  const { data: members } = await query;

  const wanted = (members ?? []).filter(
    (m: any) => ADMIN_CLIENT_ROLES.includes(String(m.client_role)) || m.can_approve === true,
  );
  if (!wanted.length) return [];

  const ids = Array.from(new Set(wanted.map((m: any) => String(m.user_id))));
  const { data: people } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, email")
    .in("id", ids);

  const seen = new Set<string>();
  const out: Recipient[] = [];
  for (const p of (people ?? []) as any[]) {
    const email = String(p.email ?? "").trim();
    if (!email || seen.has(email.toLowerCase())) continue;
    seen.add(email.toLowerCase());
    out.push({ email, name: String(p.full_name ?? "").trim() || "there" });
  }
  return out;
}

/**
 * Emails each client administrator. Never throws: a notification must not
 * roll back the invoice, request or document it is telling people about.
 */
export async function notifyClientAdmins(clientId: string | null, alert: ClientAlert) {
  try {
    const recipients = await clientAdmins(clientId);
    for (const person of recipients) {
      try {
        await sendTemplateEmail("client-admin-alert", person.email, {
          idempotencyKey: `${alert.eventKey}:${person.email.toLowerCase()}`,
          templateData: {
            contactName: person.name,
            headline: alert.headline,
            intro: alert.intro,
            details: alert.details ?? [],
            actionLabel: alert.actionLabel ?? "Open your portal",
            actionUrl: `${PORTAL_BASE}${alert.actionPath ?? "/client"}`,
          },
        });
      } catch (err) {
        console.error("[client-notify] send failed", alert.eventKey, err);
      }
    }
  } catch (err) {
    console.error("[client-notify] lookup failed", alert.eventKey, err);
  }
}

export function money(cents: number | null | undefined) {
  const n = Number(cents ?? 0) / 100;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/**
 * Emails each client administrator using a specific branded template.
 * Same guarantees as notifyClientAdmins: never throws, one send per person,
 * idempotency keyed on the event so retries do not duplicate.
 */
export async function notifyClientAdminsWith(
  clientId: string | null,
  templateName: string,
  eventKey: string,
  build: (person: { email: string; name: string }) => Record<string, unknown>,
) {
  try {
    const recipients = await clientAdmins(clientId);
    for (const person of recipients) {
      try {
        await sendTemplateEmail(templateName, person.email, {
          idempotencyKey: `${eventKey}:${person.email.toLowerCase()}`,
          templateData: build(person),
        });
      } catch (err) {
        console.error("[client-notify] send failed", eventKey, err);
      }
    }
  } catch (err) {
    console.error("[client-notify] lookup failed", eventKey, err);
  }
}

export const CLIENT_PORTAL_BASE = PORTAL_BASE;
