import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const srv = () => import("@/lib/inbox.server");

export const inboxOverviewFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const s = await srv();
    const a = await s.inboxActor(context.userId);
    const threads = await s.listThreads(a);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const clients = a.clientIds.length
      ? (((await (supabaseAdmin as any).from("clients").select("id, name").in("id", a.clientIds)).data ?? []) as any[])
      : [];
    return {
      threads,
      unread: threads.filter((t) => t.unread).length,
      canStart: a.clientIds.length > 0,
      clients: clients.map((c) => ({ id: c.id as string, name: c.name as string })),
      reps: await s.repsFor(a.clientIds),
      isStaff: a.isStaff,
    };
  });

export const inboxThreadFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const s = await srv();
    return s.loadThread(await s.inboxActor(context.userId), data.id);
  });

export const startInboxThreadFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      clientId: z.string().uuid(),
      channel: z.enum(["operations", "sales", "rep"]),
      repUserId: z.string().uuid().nullable(),
      subject: z.string().trim().min(2).max(200),
      body: z.string().trim().min(1).max(5000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const s = await srv();
    return s.startThread(await s.inboxActor(context.userId), data);
  });

export const replyInboxFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), body: z.string().trim().min(1).max(5000) }).parse(d))
  .handler(async ({ data, context }) => {
    const s = await srv();
    return s.reply(await s.inboxActor(context.userId), data.id, data.body);
  });
