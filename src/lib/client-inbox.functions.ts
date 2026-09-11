import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Messages Harmonious has emailed to the signed-in contact, newest first.
 *  Reads run as the signed-in person, so only their own copies come back. */
export const listMyMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("client_messages")
      .select("id, subject, preview, template, created_at, read_at, client_id")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { messages: data ?? [] };
  });

/** Full message body for one of the signed-in person's own messages. */
export const readMyMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("client_messages")
      .select("id, subject, body_html, template, created_at, read_at")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Message not found");

    if (!row.read_at) {
      await context.supabase
        .from("client_messages")
        .update({ read_at: new Date().toISOString() })
        .eq("id", data.id);
    }
    return { message: row };
  });

/** Marks every unread message for the signed-in person as read. */
export const markAllMessagesRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("client_messages")
      .update({ read_at: new Date().toISOString() })
      .is("read_at", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
