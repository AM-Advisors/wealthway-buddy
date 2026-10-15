/**
 * Shared helper: create a Didit verification session for a person and email
 * them the link. Server-only. Didit stays the KYC/KYB/AML authority — this
 * only sends the invitation; results arrive via Didit and auto-apply rules.
 */
const DIDIT = "https://verification.didit.me/v2";
const SITE = process.env["VITE_SITE_URL"] ?? "https://app.harmonious.co";

function diditKey(): string {
  const k = process.env["DIDIT_API_KEY"]?.trim();
  if (!k) throw new Error("Identity checks aren't configured yet.");
  return k;
}

const nm = (p: any) => p.preferred_name || [p.legal_first_name, p.legal_last_name].filter(Boolean).join(" ") || "there";

export async function sendPersonKycLink(person: any, createdBy: string): Promise<{ id: string; emailed: boolean; url: string | null }> {
  if (!person?.email) throw new Error("Add an email address first so we can send the link.");
  const workflow = process.env["DIDIT_WORKFLOW_ID"]?.trim();
  if (!workflow) throw new Error("Identity checks aren't configured yet.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const d = supabaseAdmin as any;
  const res = await fetch(`${DIDIT}/session/`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": diditKey() },
    body: JSON.stringify({
      workflow_id: workflow,
      vendor_data: `person:${person.id}`,
      callback: `${SITE}/home`,
      contact_details: { email: person.email, ...(person.phone ? { phone: person.phone } : {}) },
    }),
  });
  const text = await res.text();
  if (!res.ok) { console.error("[person-kyc] session failed", res.status, text.slice(0, 300)); throw new Error(`The identity check couldn't be started [${res.status}].`); }
  const s = JSON.parse(text);
  const url = s.url ?? s.session_url ?? s.verification_url;
  const { data: row, error } = await d.from("person_kyc_requests")
    .insert({ person_id: person.id, mode: "link", session_id: s.session_id ?? s.id ?? null, session_url: url ?? null, status: "sent", created_by: createdBy })
    .select("id").single();
  if (error) throw new Error(error.message);
  let emailed = false;
  if (url) {
    try {
      const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
      await sendTemplateEmail("manager-alert", person.email, {
        idempotencyKey: `person-kyc:${row.id}`,
        templateData: {
          managerName: nm(person),
          headline: "Please verify your identity",
          intro: "Harmonious needs to confirm your identity. It takes a few minutes: you'll photograph your ID and take a quick selfie.",
          offeringName: "Harmonious",
          details: [{ label: "What you'll need", value: "Government ID and a selfie" }],
          portalUrl: url,
        },
      });
      emailed = true;
    } catch (e) { console.error("[person-kyc] email failed", e); }
  }
  return { id: row.id as string, emailed, url: url ?? null };
}
