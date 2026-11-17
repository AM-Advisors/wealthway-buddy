import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth, requireSupabaseAuthUnverified } from "@/lib/require-auth";
import { CLIENT_TABS } from "@/lib/client-tab-access";

const srv = () => import("@/lib/client-tab-access.server");
const keys = CLIENT_TABS.map((t) => t.key) as [string, ...string[]];

export const myHiddenTabsFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuthUnverified])
  .handler(async ({ context }) => (await srv()).myHiddenTabs(context.userId) as Promise<string[]>);

export const staffTabAccessFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(z.object({ clientId: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => (await srv()).staffTabAccess(context.userId, data.clientId) as Promise<any>);

export const setTabAccessFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .validator(z.object({ clientId: z.string().uuid(), key: z.enum(keys), enabled: z.boolean() }).parse)
  .handler(async ({ data, context }) => (await srv()).setTabAccess(context.userId, data.clientId, data.key as any, data.enabled));
