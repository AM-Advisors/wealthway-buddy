import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuthUnverified } from "@/lib/require-auth";
import type { ServiceMenu } from "@/lib/service-menu";

export const myServiceMenuFn = createServerFn({ method: "POST" }).middleware([requireSupabaseAuthUnverified])
  .handler(async ({ context }) => (await import("@/lib/service-menu.server")).myServiceMenu(context.userId) as Promise<ServiceMenu>);
