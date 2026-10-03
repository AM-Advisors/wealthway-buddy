// Server-only: automatic K-1 delivery and IRS e-filing of the fund's 1065 (with its K-1s / Schedules K-1)
// through an authorized IRS e-file transmitter. Off until IRS_EFILE_ENABLED=true and transmitter credentials exist.
// Filing only happens after the 1065 is approved by a second person and marked ready to file, and every K-1 is final.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const db = () => supabaseAdmin as any;
const now = () => new Date().toISOString();

export function efileConfig() {
  const env = process.env;
  const url = env["IRS_EFILE_TRANSMITTER_URL"], key = env["IRS_EFILE_API_KEY"], efin = env["IRS_EFIN"];
  const enabled = env["IRS_EFILE_ENABLED"] === "true";
  const missing = [!url && "transmitter address", !key && "transmitter API key", !efin && "EFIN"].filter(Boolean) as string[];
  return { ready: enabled && !missing.length, enabled, missing, url, key, efin };
}

async function event(subjectTable: string, subjectId: string, ev: string, detail: Record<string, unknown>, actor: string | null, taxYear?: number, offeringId?: string) {
  const { recordTaxEvent } = await import("@/lib/tax-authz.server");
  await recordTaxEvent({ subjectTable, subjectId, taxYear, offeringId, event: ev, detail, actorUserId: actor } as any);
}

/** Final K-1 -> delivered to the investor's portal and emailed. Email failure doesn't undo delivery. */
export async function deliverK1(k1Id: string, actor: string) {
  const { data: k } = await db().from("k1_forms").select("id, status, tax_year, offering_id, investor_user_id").eq("id", k1Id).maybeSingle();
  if (!k || k.status !== "final") return { delivered: false };
  const { error } = await db().from("k1_forms").update({ status: "delivered", delivered_at: now(), updated_at: now() }).eq("id", k1Id).eq("status", "final");
  if (error) throw new Error("Couldn't deliver the K-1.");
  await event("k1_forms", k1Id, "k1_status", { auto: "delivered after tax team finalized" }, actor, k.tax_year, k.offering_id);
  let emailed = false;
  try {
    const [{ data: u }, { data: f }] = await Promise.all([db().auth.admin.getUserById(k.investor_user_id), db().from("offerings").select("name").eq("id", k.offering_id).maybeSingle()]);
    const email = u?.user?.email;
    if (email) {
      const { appUrl } = await import("@/lib/app-origins");
      const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
      const fund = f?.name ?? "your fund";
      await sendTemplateEmail("investor-message", email, {
        idempotencyKey: `k1-delivered-${k1Id}`,
        templateData: { investorName: "", offeringName: fund, subject: `Your ${k.tax_year} K-1 for ${fund} is ready`, body: `Your ${k.tax_year} Schedule K-1 for ${fund} is ready. Sign in to view and download it under Tax documents.\n\n${appUrl("client", "/investor", process.env as any)}` },
      });
      emailed = true;
    }
  } catch (e) { console.error("k1 delivery email failed", (e as Error).message); }
  return { delivered: true, emailed };
}

/** Transmit the 1065 + its K-1s when everything is approved, final and the transmitter is configured. Idempotent. */
export async function maybeTransmit1065(returnId: string, actor: string) {
  const { data: r } = await db().from("partnership_returns").select("*").eq("id", returnId).maybeSingle();
  if (!r) return { transmitted: false, reason: "Return not found." };
  if (r.filing_status !== "ready_to_file") return { transmitted: false, reason: r.filing_status === "not_filed" ? "The 1065 isn't marked ready to file." : `Already ${r.filing_status.replace(/_/g, " ")}.` };
  if (!r.approved_by || r.approved_by === r.prepared_by) return { transmitted: false, reason: "The 1065 needs approval by someone other than its preparer." };
  const { data: ks } = await db().from("k1_forms").select("id, status, investor_user_id, investment_profile_id, boxes, is_foreign, partner_classification").eq("tax_year_id", r.tax_year_id).not("status", "in", "(superseded,amended)");
  const k1s = (ks ?? []) as any[];
  if (!k1s.length) return { transmitted: false, reason: "No K-1s for this return yet." };
  if (k1s.some((k) => !["final", "delivered"].includes(k.status))) return { transmitted: false, reason: "Every K-1 must be finalized by the tax team first." };
  const cfg = efileConfig();
  if (!cfg.ready) return { transmitted: false, reason: cfg.enabled ? `IRS e-file isn't set up yet: missing ${cfg.missing.join(", ")}.` : "IRS e-file is switched off until Harmonious has its IRS e-file authorization and credentials." };
  const { data: prior } = await db().from("tax_provider_exchanges").select("id").eq("subject_id", returnId).eq("operation", "transmit_1065").eq("direction", "outbound").limit(1);
  if ((prior ?? []).length) return { transmitted: false, reason: "Already sent to the transmitter." };
  const payload = { form: "1065", taxYear: r.tax_year, offeringId: r.offering_id, returnId, efin: cfg.efin, return: { book_income_cents: r.book_income_cents, adjustments_cents: r.adjustments_cents, tax_income_cents: r.tax_income_cents, separately_stated: r.separately_stated, capital_reconciliation: r.capital_reconciliation }, scheduleK1: k1s.map((k) => ({ k1Id: k.id, investmentProfileId: k.investment_profile_id, foreign: k.is_foreign, classification: k.partner_classification, boxes: k.boxes })) };
  let ref: string | null = null, status = "submitted", err: string | null = null;
  try {
    const res = await fetch(`${cfg.url!.replace(/\/$/, "")}/returns`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.key}`, "Idempotency-Key": `1065-${returnId}-v${r.version}` }, body: JSON.stringify(payload) });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok) { status = "error"; err = String(body?.error ?? body?.message ?? `HTTP ${res.status}`).slice(0, 300); }
    ref = body?.submissionId ?? body?.id ?? null;
  } catch (e) { status = "error"; err = (e as Error).message.slice(0, 300); }
  // Payload logged without tax IDs; the transmitter pulls identifiers through its own secure exchange.
  await db().from("tax_provider_exchanges").insert({ provider: "irs_efile_transmitter", direction: "outbound", operation: "transmit_1065", subject_table: "partnership_returns", subject_id: returnId, payload: { taxYear: r.tax_year, k1Count: k1s.length, error: err }, provider_reference: ref, provider_status: status, created_by: actor });
  if (status === "error") { await event("partnership_returns", returnId, "return_1065_efile_error", { error: err }, actor, r.tax_year, r.offering_id); return { transmitted: false, reason: `The transmitter refused it: ${err}` }; }
  await db().from("partnership_returns").update({ filing_status: "transmitted", status: "transmitted", updated_at: now() }).eq("id", returnId).eq("filing_status", "ready_to_file");
  await event("partnership_returns", returnId, "return_1065_transmitted", { submissionId: ref, k1Count: k1s.length }, actor, r.tax_year, r.offering_id);
  return { transmitted: true, submissionId: ref };
}

/** IRS acknowledgement relayed by the transmitter (verified webhook). */
export async function recordEfileAck(submissionId: string, outcome: "accepted" | "rejected", detail: string | null) {
  const { data: ex } = await db().from("tax_provider_exchanges").select("subject_id").eq("provider_reference", submissionId).eq("operation", "transmit_1065").maybeSingle();
  if (!ex) return false;
  const { data: r } = await db().from("partnership_returns").select("id, tax_year, offering_id, status").eq("id", ex.subject_id).maybeSingle();
  if (!r) return false;
  await db().from("tax_provider_exchanges").insert({ provider: "irs_efile_transmitter", direction: "inbound", operation: "ack_1065", subject_table: "partnership_returns", subject_id: r.id, payload: { detail }, provider_reference: submissionId, provider_status: outcome });
  const patch: Record<string, unknown> = { filing_status: outcome, updated_at: now() };
  if (["transmitted", "accepted", "rejected"].includes(r.status)) patch["status"] = outcome;
  await db().from("partnership_returns").update(patch).eq("id", r.id);
  await event("partnership_returns", r.id, `return_1065_${outcome}`, { submissionId, detail }, null, r.tax_year, r.offering_id);
  return true;
}
