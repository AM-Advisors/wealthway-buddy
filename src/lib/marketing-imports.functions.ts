import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/require-auth";

const srv = () => import("@/lib/marketing-imports.server");

export const getImportSources = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await srv()).listImportSources(context.userId));

export const browseClickup = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await srv()).clickupBrowse(context.userId));

export const addClickupImport = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ kind: z.enum(["list", "space"]), refId: z.string().min(1).max(40), name: z.string().min(1).max(200), keepSyncing: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).addClickupSource(context.userId, data));

export const rerunClickupImport = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).runClickupSource(context.userId, data.id));

export const updateClickupImport = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), keepSyncing: z.boolean().optional(), remove: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => (await srv()).updateImportSource(context.userId, data.id, data));

export const getHubspotStatus = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await srv()).hubspotStatus(context.userId));

export const runHubspotImport = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ parts: z.array(z.enum(["contacts", "deals", "email_history", "marketing_emails"])).min(1) }).parse(d))
  .handler(async ({ data, context }) => (await srv()).importHubspot(context.userId, data.parts));

export const startHubspotConnect = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const s = await srv();
    const { requireMarketing } = await import("@/lib/marketing.server");
    await requireMarketing(context.userId);
    const clientKey = process.env["HUBSPOT_APP_USER_CONNECTOR_CLIENT_API_KEY"];
    if (!clientKey) throw new Error("HubSpot isn't set up for this app yet. Finish the HubSpot app setup first.");
    const request = getRequest();
    if (!request) throw new Error("OAuth must start from an app request.");
    const url = new URL(request.url);
    const sandboxHost = url.hostname === "localhost" ? request.headers.get("x-forwarded-host") : null;
    const returnUrl = new URL("/oauth/hubspot/return", sandboxHost ? `https://${sandboxHost}` : url.origin).toString();
    const { authorizeAppUserOAuth } = await import("@/integrations/lovable/appUserConnector");
    const { getConnectionKeyForUser } = await import("@/lib/app-user-connections.server");
    const existing = await getConnectionKeyForUser(context.userId, s.HUBSPOT_CONNECTOR_ID);
    const { authorizationUrl } = await authorizeAppUserOAuth({
      gatewayBaseUrl: s.GATEWAY_BASE_URL, connectorId: s.HUBSPOT_CONNECTOR_ID, appUserId: context.userId,
      clientAPIKey: clientKey, returnUrl, connectionAPIKey: existing ?? undefined,
      credentialsConfiguration: { scopes: s.HUBSPOT_SCOPES },
    });
    return { authorizationUrl };
  });

export const completeHubspotConnect = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ code: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const s = await srv();
    const { requireMarketing } = await import("@/lib/marketing.server");
    await requireMarketing(context.userId);
    const { exchangeAppUserOAuthCode } = await import("@/integrations/lovable/appUserConnector");
    const { saveConnectionKeyForUser } = await import("@/lib/app-user-connections.server");
    const { connectionAPIKey, connectorId } = await exchangeAppUserOAuthCode(s.GATEWAY_BASE_URL, data.code);
    if (connectorId !== s.HUBSPOT_CONNECTOR_ID) throw new Error("OAuth completion returned the wrong connector");
    await saveConnectionKeyForUser(context.userId, connectorId, connectionAPIKey);
    return { ok: true };
  });

export const disconnectHubspot = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const s = await srv();
    const { getConnectionKeyForUser, deleteConnectionKeyForUser } = await import("@/lib/app-user-connections.server");
    const { disconnectAppUser } = await import("@/integrations/lovable/appUserConnector");
    const key = await getConnectionKeyForUser(context.userId, s.HUBSPOT_CONNECTOR_ID);
    if (key) {
      await disconnectAppUser({ gatewayBaseUrl: s.GATEWAY_BASE_URL, connectionAPIKey: key, connectorId: s.HUBSPOT_CONNECTOR_ID });
      await deleteConnectionKeyForUser(context.userId, s.HUBSPOT_CONNECTOR_ID);
    }
    return { ok: true };
  });
