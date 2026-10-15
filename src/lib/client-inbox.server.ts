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
  /** Reminders reach every signed-up person (investors too), not only client contacts. */
  anyUser?: boolean | undefined;
}): Promise<string | null> {
  try {
    const email = String(input.recipientEmail ?? "").trim().toLowerCase();
    if (!email) return null;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle();
    if (!profile?.id) return null;

    const { data: membership } = await supabaseAdmin
      .from("client_users")
      .select("client_id")
      .eq("user_id", profile.id)
      .limit(1)
      .maybeSingle();
    // Only client contacts get a portal inbox.
    if (!membership?.client_id && !input.anyUser) return null;

    const preview = (input.text ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 240);

    const { data: ins } = await supabaseAdmin.from("client_messages").upsert(
      {
        user_id: profile.id,
        client_id: membership?.client_id ?? null,
        template: input.template,
        subject: input.subject,
        body_html: input.html,
        preview: preview || null,
        recipient_email: email,
        dedupe_key: input.dedupeKey ?? null,
      },
      { onConflict: "user_id,dedupe_key", ignoreDuplicates: true },
    ).select("id").maybeSingle();
    return (ins as any)?.id ?? null;
  } catch (err) {
    console.error("[client-inbox] copy failed", input.template, err);
    return null;
  }
}
