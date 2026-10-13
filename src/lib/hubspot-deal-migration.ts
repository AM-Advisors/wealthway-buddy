/**
 * HubSpot → Harmonious deal migration: pure rules (stage mapping, field
 * validation, conflict detection and reconciliation). No I/O here.
 */
import type { DealStage } from "@/lib/crm-model";

export type HsStage = { pipelineId: string; stageId: string; isClosed: boolean; probability: number | null; label: string };

/** Default Harmonious stage for a HubSpot stage; staff can override per stage. */
export function defaultStageFor(s: HsStage): DealStage {
  const p = s.probability;
  const l = s.label.toLowerCase();
  if (s.isClosed) {
    if (p === 1 || /won/.test(l)) return "won";
    return "lost";
  }
  if (p == null) return "lead";
  if (p < 0.1) return "lead";
  if (p < 0.3) return "contacted";
  if (p < 0.5) return "meeting";
  if (p < 0.8) return "proposal";
  return "committed";
}

/** HubSpot amounts are strings. Returns cents, or an issue when not a valid non-negative number. */
export function parseAmount(raw: unknown): { cents: number | null; issue?: string } {
  if (raw === null || raw === undefined || raw === "") return { cents: null };
  const n = Number(String(raw).replace(/,/g, ""));
  if (!Number.isFinite(n)) return { cents: null, issue: `Amount "${String(raw)}" is not a number` };
  if (n < 0) return { cents: null, issue: `Amount ${n} is negative` };
  return { cents: Math.round(n * 100) };
}

export function parseDate(raw: unknown): string | null {
  if (!raw) return null;
  const d = new Date(String(raw));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** True when someone changed the deal inside Harmonious after the last import, so a re-import must not overwrite it. */
export function editedInHarmonious(row: { updated_at: string; last_imported_at: string | null }): boolean {
  if (!row.last_imported_at) return false;
  return new Date(row.updated_at).getTime() - new Date(row.last_imported_at).getTime() > 2000;
}

export type ReconcileLine = { check: string; hubspot: number; harmonious: number; ok: boolean };

export function reconcileLine(check: string, hubspot: number, harmonious: number): ReconcileLine {
  return { check, hubspot, harmonious, ok: hubspot === harmonious };
}

export function reconciled(lines: ReconcileLine[]): boolean {
  return lines.length > 0 && lines.every((l) => l.ok);
}

export const ENGAGEMENT_TYPES = ["emails", "notes", "meetings", "calls", "tasks"] as const;
export type EngagementType = (typeof ENGAGEMENT_TYPES)[number];

export const ENGAGEMENT_PROPS: Record<EngagementType, { subject: string; body: string; props: string[] }> = {
  emails: { subject: "hs_email_subject", body: "hs_email_text", props: ["hs_email_subject", "hs_email_text", "hs_email_direction", "hs_timestamp", "hs_email_from_email", "hs_email_to_email", "hubspot_owner_id"] },
  notes: { subject: "", body: "hs_note_body", props: ["hs_note_body", "hs_timestamp", "hubspot_owner_id"] },
  meetings: { subject: "hs_meeting_title", body: "hs_meeting_body", props: ["hs_meeting_title", "hs_meeting_body", "hs_timestamp", "hs_meeting_start_time", "hs_meeting_end_time", "hs_meeting_outcome", "hubspot_owner_id"] },
  calls: { subject: "hs_call_title", body: "hs_call_body", props: ["hs_call_title", "hs_call_body", "hs_timestamp", "hs_call_duration", "hs_call_direction", "hs_call_disposition", "hubspot_owner_id"] },
  tasks: { subject: "hs_task_subject", body: "hs_task_body", props: ["hs_task_subject", "hs_task_body", "hs_timestamp", "hs_task_status", "hs_task_priority", "hubspot_owner_id"] },
};

/** Strip HTML for a short readable snippet. */
export function snippet(v: unknown, max = 500): string | null {
  if (!v) return null;
  const s = String(v).replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
}
