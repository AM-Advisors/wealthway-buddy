/**
 * Bulk investor tools for a fund's Investors tab: KYC link blasts, duplicate
 * review/merge, missing-info requests to the fund manager, and bulk class
 * assignment. Server-only. Every function is called behind assertFund; merges
 * are staff-only, manual-confirm, audited, and never delete data. Didit stays
 * the KYC/KYB/AML authority — bulk sends only deliver Didit's own links.
 */
import { assertFund, db, isStaff, investorGrid } from "@/lib/fund-tabs.server";
import { logFundAudit } from "@/lib/fund-audit.server";

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

async function onboardingsWithPeople(fundId: string, ids: string[]) {
  const d = await db();
  const { data: rows } = await d.from("investor_onboardings")
    .select("id, person_id, application_id, stage, offering_class_key, commitment_amount_cents")
    .eq("offering_id", fundId).is("removed_at", null).in("id", ids);
  const list = (rows ?? []) as any[];
  const pids = [...new Set(list.map((o) => o.person_id).filter(Boolean))];
  const { data: people } = pids.length
    ? await d.from("persons").select("id, legal_first_name, legal_last_name, preferred_name, email, phone, kyc_status").in("id", pids)
    : { data: [] as any[] };
  const byId = new Map(((people ?? []) as any[]).map((p) => [p.id, p]));
  return list.map((o) => ({ ...o, person: o.person_id ? byId.get(o.person_id) ?? null : null }));
}

/* ---------------- 1. Bulk KYC links ---------------- */

export async function bulkSendKycLinks(userId: string, fundId: string, onboardingIds: string[]) {
  await assertFund(userId, fundId);
  const rows = await onboardingsWithPeople(fundId, onboardingIds);
  const { sendPersonKycLink } = await import("@/lib/person-kyc-link.server");
  const results: { onboardingId: string; name: string; outcome: "sent" | "skipped" | "failed"; reason?: string }[] = [];
  for (const o of rows) {
    const p = o.person;
    const name = p ? (p.preferred_name || [p.legal_first_name, p.legal_last_name].filter(Boolean).join(" ")) : "Unnamed investor";
    if (!p) { results.push({ onboardingId: o.id, name, outcome: "skipped", reason: "No person linked" }); continue; }
    if (!p.email) { results.push({ onboardingId: o.id, name, outcome: "skipped", reason: "No email on file" }); continue; }
    if (["verified", "approved", "passed", "clear"].includes(p.kyc_status ?? "")) { results.push({ onboardingId: o.id, name, outcome: "skipped", reason: "KYC already approved" }); continue; }
    try {
      await sendPersonKycLink(p, userId);
      results.push({ onboardingId: o.id, name, outcome: "sent" });
    } catch (e) {
      results.push({ onboardingId: o.id, name, outcome: "failed", reason: (e as Error).message });
    }
  }
  const sent = results.filter((r) => r.outcome === "sent").length;
  await logFundAudit(userId, { offeringId: fundId, eventType: "bulk_kyc_links", summary: `Sent ${sent} identity-check link${sent === 1 ? "" : "s"} to investors`, values: { requested: onboardingIds.length, sent } });
  return results;
}

/* ---------------- 2. Duplicate detection & merge ---------------- */

export async function listInvestorDuplicates(userId: string, fundId: string) {
  const access = await assertFund(userId, fundId);
  const grid = await investorGrid(fundId);
  const groups = new Map<string, any[]>();
  for (const r of grid) {
    const key = r.email ? `email:${norm(r.email)}` : `name:${norm(r.name)}`;
    if (!key.endsWith(":")) groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const duplicates = [...groups.values()].filter((g) => g.length > 1)
    .map((g) => g.map((r) => ({ id: r.id, name: r.name, email: r.email, committedCents: r.committedCents, docs: r.docs, stage: r.stage })));
  return { staff: access.staff, duplicates };
}

export async function mergeInvestors(userId: string, fundId: string, keepId: string, archiveId: string, reason: string) {
  if (!(await isStaff(userId))) throw new Error("Only Harmonious staff can merge investor records.");
  await assertFund(userId, fundId);
  if (keepId === archiveId) throw new Error("Pick two different records.");
  if (!reason.trim()) throw new Error("Give a reason — it's saved in Audit History.");
  const d = await db();
  const { data: pair } = await d.from("investor_onboardings").select("id, person_id, application_id, stage").eq("offering_id", fundId).is("removed_at", null).in("id", [keepId, archiveId]);
  const keep = (pair ?? []).find((x: any) => x.id === keepId);
  const lose = (pair ?? []).find((x: any) => x.id === archiveId);
  if (!keep || !lose) throw new Error("Both records must be active investors in this fund.");
  // Carry over anything keyed to the archived record; nothing is deleted.
  await d.from("side_letters").update({ onboarding_id: keepId }).eq("onboarding_id", archiveId);
  await d.from("investment_readiness_tasks").update({ onboarding_id: keepId }).eq("onboarding_id", archiveId);
  if (lose.application_id && !keep.application_id) {
    await d.from("investor_onboardings").update({ application_id: lose.application_id }).eq("id", keepId);
  }
  const now = new Date().toISOString();
  const { error } = await d.from("investor_onboardings")
    .update({ removed_at: now, merged_into_onboarding_id: keepId })
    .eq("id", archiveId).is("removed_at", null);
  if (error) throw new Error(error.message);
  await logFundAudit(userId, { offeringId: fundId, eventType: "investor_merged", summary: "Merged a duplicate investor record", values: { kept: keepId, archived: archiveId, reason: reason.trim() } });
  return { ok: true };
}

/* ---------------- 3. Missing-info request to the fund manager ---------------- */

export async function requestMissingInfo(userId: string, fundId: string, onboardingIds: string[]) {
  await assertFund(userId, fundId);
  const d = await db();
  const grid = await investorGrid(fundId);
  const picked = grid.filter((r) => onboardingIds.includes(r.id) && r.missing.length > 0);
  if (!picked.length) throw new Error("Nothing missing on the selected investors.");
  const { data: mgrs } = await d.from("fund_managers").select("user_id").eq("offering_id", fundId);
  const mgrIds = [...new Set(((mgrs ?? []) as any[]).map((m) => m.user_id).filter(Boolean))];
  const { data: people } = mgrIds.length ? await d.from("persons").select("email, legal_first_name, preferred_name").in("user_id", mgrIds) : { data: [] as any[] };
  const emails = [...new Set(((people ?? []) as any[]).map((p) => p.email).filter(Boolean))] as string[];
  if (!emails.length) throw new Error("This fund has no manager with an email address to send to.");
  const { data: offering } = await d.from("offerings").select("name").eq("id", fundId).maybeSingle();
  const lines = picked.map((r) => `${r.name}: ${r.missing.join(", ")}`);
  const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
  let sent = 0;
  for (const email of emails) {
    try {
      await sendTemplateEmail("manager-alert", email, {
        idempotencyKey: `missing-info:${fundId}:${new Date().toISOString().slice(0, 10)}:${email}`,
        templateData: {
          managerName: "there",
          headline: `Missing investor information for ${offering?.name ?? "your fund"}`,
          intro: "Harmonious needs the following details to complete these investor records. Reply to this email or update them in the portal.",
          offeringName: offering?.name ?? "Fund",
          details: lines.map((l) => ({ label: l.split(":")[0], value: l.slice(l.indexOf(":") + 1).trim() })),
        },
      });
      sent++;
    } catch (e) { console.error("[missing-info] email failed", e); }
  }
  await logFundAudit(userId, { offeringId: fundId, eventType: "missing_info_requested", summary: `Asked the fund manager for missing info on ${picked.length} investor${picked.length === 1 ? "" : "s"}`, values: { investors: picked.map((r) => r.name), emailed: sent } });
  return { investors: picked.length, emailed: sent };
}

/* ---------------- 5. Bulk class assignment ---------------- */

export async function bulkSetClass(userId: string, fundId: string, onboardingIds: string[], classKey: string) {
  await assertFund(userId, fundId);
  const key = classKey.trim();
  if (!key) throw new Error("Pick a class to assign.");
  const d = await db();
  const { error } = await d.from("investor_onboardings").update({ offering_class_key: key })
    .eq("offering_id", fundId).is("removed_at", null).in("id", onboardingIds);
  if (error) throw new Error(error.message);
  await logFundAudit(userId, { offeringId: fundId, eventType: "bulk_class_set", summary: `Set class "${key}" on ${onboardingIds.length} investor${onboardingIds.length === 1 ? "" : "s"}`, values: { classKey: key, count: onboardingIds.length } });
  return { ok: true, count: onboardingIds.length };
}
