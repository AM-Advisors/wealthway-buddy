import { z } from "zod";

export const responseKind = z.enum(["quote", "proposal", "rfp", "rfq"]);
export const responseDraft = z.object({
  instructions: z.string().trim().max(2000),
  message: z.string().trim().min(1).max(5000),
  recipient: z.string().trim().email().max(254),
  requestId: z.string().uuid(),
});
export type ResponseEvent = { event: string; detail: Record<string, unknown>; created_at: string };
export function responseProjection(events: ResponseEvent[], version: number, signed: boolean, ready: boolean, email?: string) {
  const rows = events.filter((e) => e.detail['version'] === version && (!email || !e.detail['recipient'] || e.detail['recipient'] === email.toLowerCase()))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const last = [...rows].reverse().find((e) => ["client_reviewed", "client_changes_requested", "response_sent"].includes(e.event));
  const instructions = [...rows].reverse().find((e) => e.event === "response_instructions")?.detail['instructions'];
  return {
    instructions: typeof instructions === "string" ? instructions : "",
    status: signed ? "signed" : last?.event === "client_changes_requested" ? "changes_requested" : last?.event === "client_reviewed" ? "reviewed" : ready || last?.event === "response_sent" ? "awaiting_response" : "not_sent",
    messages: rows.filter((e) => ["response_sent", "client_reviewed", "client_changes_requested"].includes(e.event)).map((e) => ({
      event: e.event, message: String(e.detail['message'] ?? ""), at: e.created_at,
    })),
  };
}
export const RESPONSE_STATUS: Record<string, string> = {
  signed: "Signed", changes_requested: "Changes requested", reviewed: "Reviewed · awaiting signature", awaiting_response: "Awaiting client review", not_sent: "Not sent",
};
export function responseAllowed(status: string, version: number, tokenVersion: number, signed: boolean) {
  return !signed && version === tokenVersion && ["approved", "sent"].includes(status);
}