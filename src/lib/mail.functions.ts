/** Server functions for the staff mail client (personal + group mailboxes) and group-mailbox tickets. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const engine = () => import("@/lib/mail-engine.server");
const mailbox = z.union([z.literal("me"), z.string().uuid()]);
const folder = z.enum(["inbox", "sent", "drafts", "archive", "trash", "starred"]);
const outgoing = z.object({
  to: z.string().min(3).max(2000), cc: z.string().max(2000).optional(), subject: z.string().max(500),
  body: z.string().max(200000), threadId: z.string().max(100).optional(), inReplyTo: z.string().max(1000).optional(), references: z.string().max(4000).optional(),
});

async function log(userId: string, label: string) {
  const { logActivity } = await import("@/lib/staff-directory.server");
  await logActivity(userId, "action", "/ops/mail", label).catch(() => undefined);
}

export const listMail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ mailbox, folder, search: z.string().max(300).optional(), pageToken: z.string().max(500).optional() }).parse(d))
  .handler(async ({ context, data }) => {
    const e = await engine();
    const { call, group } = await e.resolveMailbox(context.userId, data.mailbox);
    const res = await e.listThreads(call, data.folder, data.search, data.pageToken);
    let tickets: Record<string, any> = {};
    if (group) {
      if (data.folder === "inbox") await e.syncTickets(group.id, group.email, res.threads);
      tickets = await e.ticketsFor(group.id, res.threads.map((t) => t.id));
    }
    return { ...res, tickets, me: context.userId };
  });

export const getMailThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ mailbox, threadId: z.string().min(1).max(100) }).parse(d))
  .handler(async ({ context, data }) => {
    const e = await engine();
    const { call, group } = await e.resolveMailbox(context.userId, data.mailbox);
    const thread = await e.getThread(call, data.threadId);
    const ticket = group ? await e.ticketDetail(group.id, data.threadId) : null;
    return { thread, ticket };
  });

export const sendMailMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ mailbox, message: outgoing, draftId: z.string().max(100).optional() }).parse(d))
  .handler(async ({ context, data }) => {
    const e = await engine();
    const { call, group } = await e.resolveMailbox(context.userId, data.mailbox);
    let threadId = data.message.threadId;
    if (data.draftId) { await e.saveDraft(call, data.message, data.draftId); await e.sendDraft(call, data.draftId); }
    else threadId = (await e.sendMail(call, data.message)).threadId;
    if (group && threadId) await e.recordReply(context.userId, group.id, threadId);
    await log(context.userId, group ? `Sent email from group mailbox ${group.email ?? ""}` : "Sent email from own inbox");
    return { ok: true };
  });

export const saveMailDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ mailbox, message: outgoing, draftId: z.string().max(100).optional() }).parse(d))
  .handler(async ({ context, data }) => {
    const e = await engine();
    const { call } = await e.resolveMailbox(context.userId, data.mailbox);
    return await e.saveDraft(call, data.message, data.draftId);
  });

export const getMailDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ mailbox, draftId: z.string().max(100) }).parse(d))
  .handler(async ({ context, data }) => {
    const e = await engine();
    const { call } = await e.resolveMailbox(context.userId, data.mailbox);
    return await e.getDraft(call, data.draftId);
  });

export const discardMailDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ mailbox, draftId: z.string().max(100) }).parse(d))
  .handler(async ({ context, data }) => {
    const e = await engine();
    const { call } = await e.resolveMailbox(context.userId, data.mailbox);
    await e.deleteDraft(call, data.draftId);
    return { ok: true };
  });

export const mailThreadAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ mailbox, threadId: z.string().max(100), action: z.enum(["archive", "inbox", "trash", "untrash", "read", "unread", "star", "unstar"]) }).parse(d))
  .handler(async ({ context, data }) => {
    const e = await engine();
    const { call, group } = await e.resolveMailbox(context.userId, data.mailbox);
    await e.threadAction(call, data.threadId, data.action);
    if (group && (data.action === "trash" || data.action === "archive")) await log(context.userId, `${data.action} in group mailbox ${group.email ?? ""}`);
    return { ok: true };
  });

export const updateMailTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    ticketId: z.string().uuid(), assigneeId: z.string().uuid().nullable().optional(),
    status: z.enum(["open", "in_progress", "waiting", "resolved"]).optional(), note: z.string().max(2000).optional(),
  }).parse(d))
  .handler(async ({ context, data }) => {
    const e = await engine();
    await e.updateTicket(context.userId, data.ticketId, data);
    return { ok: true };
  });

export const getMailTicketBoard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ mailboxId: z.string().uuid().nullable() }).parse(d))
  .handler(async ({ context, data }) => {
    const { requireStaff } = await import("@/lib/gmail.server");
    await requireStaff(context.userId);
    const e = await engine();
    const [board, staff] = await Promise.all([e.ticketBoard(data.mailboxId), e.staffOptions()]);
    return { ...board, staff };
  });
