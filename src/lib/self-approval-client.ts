import { createMiddleware } from "@tanstack/react-start";
import { SELF_APPROVAL_EVENT, SELF_APPROVAL_MARKER } from "@/lib/self-approval-shared";
import { recordSelfApprovalFn } from "@/lib/self-approval-functions.client";

/** Saves the reason on the server (append-only) before the approval is retried. */
export async function saveSelfApprovalReason(key: string, reason: string) {
  await recordSelfApprovalFn({ data: { key, reason } });
}

/** Opens the reason box when the server asks for a Super Admin self-approval reason. */
export const selfApprovalMiddleware = createMiddleware({ type: "function" }).client(async ({ next }) => {
  try {
    return await next();
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
