/** Which inbox channels a client may write to, from its funds' active service levels. */
import { normalizeServiceLevel } from "@/lib/service-level";

export type InboxChannel = "operations" | "sales" | "rep" | "direct";

/** Self Serve clients (no fund on an active paid level) only reach Harmonious Operations. */
export function allowedInboxChannels(activeLevels: unknown[]): InboxChannel[] {
  const paid = activeLevels.some((l) => normalizeServiceLevel(l) !== "self_serve");
  return paid ? ["operations", "sales", "rep", "direct"] : ["operations", "direct"];
}

/** A paid level that is active sends the automatic onboarding email; Self Serve never does. */
export function sendsOnboardingEmail(activeLevel: unknown, status: string): boolean {
  return status === "active" && normalizeServiceLevel(activeLevel) !== "self_serve";
}
