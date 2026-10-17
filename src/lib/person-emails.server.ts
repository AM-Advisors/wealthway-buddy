// Server-only helper: resolves a person's secondary email so notification
// emails can be copied to it. Browser code goes through the person-records
// functions; other server modules may import this directly.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { cleanSecondaryEmail } from "./person-emails";

const db = () => supabaseAdmin as any;

/**
 * The secondary email to CC for a recipient address, or undefined when the
 * person has none (or the recipient isn't a person we know). Never throws —
 * a lookup problem just means no copy is sent.
 */
export async function secondaryCcFor(email: string | null | undefined): Promise<string | undefined> {
  const to = (email ?? "").trim().toLowerCase();
  if (!to) return undefined;
  try {
    const { data } = await db()
      .from("persons")
      .select("email, secondary_email")
      .ilike("email", to)
      .limit(1);
    const person = (data ?? [])[0] as { email: string | null; secondary_email: string | null } | undefined;
    if (!person?.secondary_email) return undefined;
    const cleaned = cleanSecondaryEmail(person.email, person.secondary_email);
    return cleaned.ok && cleaned.value ? cleaned.value : undefined;
  } catch {
    return undefined;
  }
}
