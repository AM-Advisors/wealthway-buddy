/**
 * Saves a copy of every branded email we send to a client contact into their
 * portal inbox, so invoices and notices are readable inside the portal and not
 * only in their mailbox.
 *
 * Never throws: a portal copy must never stop or roll back a real send.
 */
export async function recordClientInboxCopy(input: {
  recipientEmail: string;
  template: string;
  subject: string;
  html: string;
  text?: string | undefined;
  dedupeKey?: string | undefined;
}) {
  try {
    const email = String(input.recipientEmail ?? "").trim().toLowerCase();
    if (!email) return;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle();
    if (!profile?.id) return;

    const { data: membership } = await supabaseAdmin
      .from("client_users")
      .select("client_id")
      .eq("user_id", profile.id)
      .limit(1)
      .maybeSingle();
    // Only client contacts get a portal inbox.
    if (!membership?.client_id) return;

    const preview = (input.text ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 240);

    await supabaseAdmin.from("client_messages").upsert(
      {
        user_id: profile.id,
        client_id: membership.client_id,
        template: input.template,
        subject: input.subject,
        body_html: input.html,
        preview: preview || null,
        recipient_email: email,
        dedupe_key: input.dedupeKey ?? null,
      },
      { onConflict: "user_id,dedupe_key", ignoreDuplicates: true },
    );
  } catch (err) {
    console.error("[client-inbox] copy failed", input.template, err);
  }
}
