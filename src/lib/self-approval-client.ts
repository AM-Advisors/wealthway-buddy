import { createMiddleware } from "@tanstack/react-start";
import { SELF_APPROVAL_EVENT, SELF_APPROVAL_HEADER, SELF_APPROVAL_MARKER } from "@/lib/self-approval-shared";

const KEY = "harmonious-self-approval-reasons";
const TTL = 10 * 60 * 1000;
type Store = Record<string, { reason: string; at: number }>;

function read(): Store {
  if (typeof window === "undefined") return {};
  try {
    const s = JSON.parse(window.sessionStorage.getItem(KEY) ?? "{}") as Store;
    const now = Date.now();
    return Object.fromEntries(Object.entries(s).filter(([, v]) => now - v.at < TTL));
  } catch {
    return {};
  }
}

export function saveSelfApprovalReason(key: string, reason: string) {
  const s = read();
  s[key] = { reason, at: Date.now() };
  window.sessionStorage.setItem(KEY, JSON.stringify(s));
}

/** Sends any recent Super Admin self-approval reasons, and opens the reason box when the server asks for one. */
export const selfApprovalMiddleware = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const s = read();
  const entries = Object.entries(s);
  const headers = entries.length
    ? { [SELF_APPROVAL_HEADER]: encodeURIComponent(JSON.stringify(Object.fromEntries(entries.map(([k, v]) => [k, v.reason])))) }
    : undefined;
  try {
    return await next(headers ? { headers } : undefined);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    const i = msg.indexOf(SELF_APPROVAL_MARKER);
    if (i >= 0 && typeof window !== "undefined") {
      const key = msg.slice(i + SELF_APPROVAL_MARKER.length, msg.indexOf("]", i));
      window.dispatchEvent(new CustomEvent(SELF_APPROVAL_EVENT, { detail: { key } }));
      try { (e as Error).message = msg.slice(0, i).trim(); } catch { /* read-only */ }
    }
    throw e;
  }
});
