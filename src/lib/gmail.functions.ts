/**
 * Server functions for staff Google inboxes (per-employee and group mailboxes).
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";
import {
  authorizeAppUserOAuth,
  exchangeAppUserOAuthCode,
  disconnectAppUser,
} from "@/integrations/lovable/appUserConnector";
import {
  saveConnectionKeyForUser,
  getConnectionKeyForUser,
  deleteConnectionKeyForUser,
} from "@/lib/app-user-connections.server";
import {
  GATEWAY_BASE_URL,
  GMAIL_CONNECTOR_ID,
  GOOGLE_MAIL_SCOPES,
  gmailStatusForUser,
  listGmailThreadsForUser,
  listGroupMailboxes,
  registerGroupMailbox,
  removeGroupMailbox,
  sendFromGroupMailbox,
  listGroupMailboxThreads,
  requireStaff,
} from "@/lib/gmail.server";

export const startGoogleConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStaff(context.userId);
    const clientKey = process.env['GOOGLE_MAIL_APP_USER_CONNECTOR_CLIENT_API_KEY'];
    if (!clientKey) throw new Error("Google sign-in isn't configured for this project yet.");
    const request = getRequest();
    if (!request) throw new Error("OAuth must start from an app request.");
    const url = new URL(request.url);
    const sandboxHost = url.hostname === "localhost" ? request.headers.get("x-forwarded-host") : null;
    const returnUrl = new URL("/oauth/google/return", sandboxHost ? `https://${sandboxHost}` : url.origin).toString();

    // Reconnect: pass the stored key so the gateway can confirm ownership.
    const connectionAPIKey = await getConnectionKeyForUser(context.userId, GMAIL_CONNECTOR_ID);

    const { authorizationUrl } = await authorizeAppUserOAuth({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectorId: GMAIL_CONNECTOR_ID,
      appUserId: context.userId,
      clientAPIKey: clientKey,
      returnUrl,
      connectionAPIKey: connectionAPIKey ?? undefined,
      credentialsConfiguration: { scopes: GOOGLE_MAIL_SCOPES },
    });
    return { authorizationUrl };
  });

export const completeGoogleConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { code: string }) => z.object({ code: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    await requireStaff(context.userId);
    const { connectionAPIKey, connectorId } = await exchangeAppUserOAuthCode(GATEWAY_BASE_URL, data.code);
    if (connectorId !== GMAIL_CONNECTOR_ID) throw new Error("OAuth completion returned the wrong connector");
    await saveConnectionKeyForUser(context.userId, connectorId, connectionAPIKey);
    return { ok: true };
  });

export const disconnectGoogle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStaff(context.userId);
    const key = await getConnectionKeyForUser(context.userId, GMAIL_CONNECTOR_ID);
    if (key) {
      await disconnectAppUser({ gatewayBaseUrl: GATEWAY_BASE_URL, connectionAPIKey: key, connectorId: GMAIL_CONNECTOR_ID });
      await deleteConnectionKeyForUser(context.userId, GMAIL_CONNECTOR_ID);
    }
    return { ok: true };
  });

export const getMyGmailStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStaff(context.userId);
    return gmailStatusForUser(context.userId);
  });

export const getMyGmailThreads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { query?: string | undefined }) => z.object({ query: z.string().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireStaff(context.userId);
    const rows = await listGmailThreadsForUser(context.userId, data.query);
    return { threads: rows ?? [] };
  });

export const getGroupMailboxes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStaff(context.userId);
    return { mailboxes: await listGroupMailboxes() };
  });

export const addGroupMailbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { label: string; envKey: string }) =>
    z.object({ label: z.string().min(1).max(80), envKey: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    await registerGroupMailbox(context.userId, data.label, data.envKey);
    return { ok: true };
  });

export const deleteGroupMailbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await removeGroupMailbox(context.userId, data.id);
    return { ok: true };
  });

export const sendGroupMailboxEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { mailboxId: string; to: string; subject: string; body: string }) =>
    z.object({ mailboxId: z.string().uuid(), to: z.string().email(), subject: z.string().min(1), body: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    await sendFromGroupMailbox(context.userId, data.mailboxId, { to: data.to, subject: data.subject, body: data.body });
    return { ok: true };
  });

export const getGroupMailboxThreads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { mailboxId: string }) => z.object({ mailboxId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    return { threads: await listGroupMailboxThreads(context.userId, data.mailboxId) };
  });
