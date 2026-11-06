/**
 * Per-investor document follow-up status. Pure projection over recorded facts:
 * sends (offering_document_sends), signed-in opens (legal readership trail),
 * and canonical signature/acknowledgment state. Never infers reading from
 * email opens and never treats an open as a signature.
 */
import type { ExecutionState } from "@/lib/offering-document-model";

export type FollowUpStatus = "signed" | "awaiting_fund" | "opened_unsigned" | "sent_unopened" | "not_sent" | "read_only";

export type FollowUpInput = {
  usage: "signature" | "acknowledgment" | "reference" | null;
  execution: ExecutionState;
  acknowledged: boolean;
  sentAt: string | null;
  openedAt: string | null;
};

export function followUpStatus(i: FollowUpInput): FollowUpStatus {
  if (i.usage === "reference") return "read_only";
  if (i.usage === "acknowledgment" ? i.acknowledged : i.execution === "fully_executed") return "signed";
  if (i.usage !== "acknowledgment" && i.execution === "awaiting_countersignature") return "awaiting_fund";
  if (i.openedAt) return "opened_unsigned";
  if (i.sentAt) return "sent_unopened";
  return "not_sent";
}

export const FOLLOW_UP_LABELS: Record<FollowUpStatus, string> = {
  signed: "Signed",
  awaiting_fund: "Signed · awaiting fund signature",
  opened_unsigned: "Opened · not signed",
  sent_unopened: "Sent · not opened",
  not_sent: "Not sent",
  read_only: "For reading only",
};

/** Statuses where the investor still owes a signature. */
export const needsFollowUp = (s: FollowUpStatus) => s === "opened_unsigned" || s === "sent_unopened";
