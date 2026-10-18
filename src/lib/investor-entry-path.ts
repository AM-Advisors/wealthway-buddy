import { safeInternalPath } from "@/lib/app-origins";

/** Invitation context only; destinations still authorize the signed-in caller. */
export function investorEntryPath(search: string): string | null {
  const params = new URLSearchParams(search);
  const path = safeInternalPath(params.get("next") ?? params.get("redirect"), "");
  return /^\/(?:join|onboard)\/[A-Za-z0-9_-]{16,128}$/.test(path)
    || /^\/onboard\/i\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(path)
    ? path : null;
}
