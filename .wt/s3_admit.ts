import { guard, step, U, N, BATCH } from "./lib";
import { WALKTHROUGH_INVESTORS, capitalFor } from "@/lib/reference-fund/walkthrough-source";
import { EVIDENCE_REQUIREMENTS } from "@/lib/takeover-admission-model";
const d = await guard();
const ta = await import("@/lib/takeover-admission.server");
const { data: pos } = await d.from("investor_positions").select("id,display_name,status,origin").eq("offering_id", N);
const { data: closed } = await d.from("investor_onboardings").select("position_id").eq("offering_id", N).eq("stage", "closed");
const closedIds = new Set(closed.map((c: any) => c.position_id));
const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
const rows: any[] = [];
for (const p of pos) {
  if (closedIds.has(p.id)) continue;
  const inv = WALKTHROUGH_INVESTORS.find((i) => norm(p.display_name).startsWith(norm(i.key).slice(0, 8)) || norm(i.key).startsWith(norm(p.display_name).slice(0, 8)));
  if (!inv) { console.log("NO SOURCE MATCH", p.display_name); continue; }
  const c = inv.commitment * 100;
  const ref = "DEMO / SYNTHETIC prior-administrator investor roster + capital register as of 2025-12-31";
  rows.push({
    offeringId: N, positionId: p.id, batchRef: BATCH, origin: "takeover_prior_administrator", sourceSystem: "DEMO prior administrator (synthetic)",
    asOfDate: "2025-12-31", relationshipEffectiveDate: null, investorName: inv.key, investorType: null, classLabel: inv.cls,
    commitmentCents: c, calledCents: Math.round(c * 0.4), contributedCents: Math.round(c * 0.4), openingCapitalCents: capitalFor(inv.commitment),
    evidence: EVIDENCE_REQUIREMENTS.map((r) => ({ key: r.key, status: r.key === "admission_closing" ? "missing" : "verified_from_source", sourceRef: r.key === "admission_closing" ? null : ref })),
    compliance: { kyc: "prior_admin_verified", identity: "prior_admin_verified", aml: inv.key.startsWith("Erik") ? "review_required" : "prior_admin_verified", accreditation: "prior_admin_verified", subscription_document: "prior_admin_verified", tax_document: inv.tax ? "prior_admin_verified" : "missing", taxDocumentType: inv.tax ? null : "W-9" },
    notes: "Synthetic takeover admission for the DEMO Walkthrough reference fund.",
  });
}
console.log("to admit", rows.length, rows.map((r) => r.investorName).join(" | "));
const prep = await ta.prepareTakeoverBatch(U.prep, rows);
console.log(JSON.stringify(prep.map((r) => [r.name.slice(0, 14), r.ok, r.status ?? r.error])));
const first = prep.find((r) => r.ok)!;
await step("preparer cannot admit own", () => ta.decideTakeoverAdmission(U.prep, { admissionId: first.id!, approve: true, reason: null }), true);
const again = await ta.prepareTakeoverBatch(U.prep, rows);
console.log("rerun reused:", again.every((r) => r.ok));
for (const r of prep.filter((x) => x.ok && x.status === "approval_required")) await step(`admit ${r.name}`, () => ta.decideTakeoverAdmission(U.rev, { admissionId: r.id!, approve: true, reason: "Matches the approved Phase 1 migration roster." }));
const o = await ta.takeoverOverview(U.rev, N);
console.log("TOTALS", JSON.stringify(o.totals));
for (const e of o.eligibility) console.log([e.name.slice(0, 22), e.origin, e.admissionStatus, e.commitmentCents / 100, e.calledCents / 100, e.contributedCents / 100, e.remainingCents / 100, e.eligible, e.reason, e.flags.join("; ")].join(" | "));
const adm = o.admissions.filter((a: any) => a.status === "admitted");
console.log("BATCH", adm.length, adm.reduce((s: number, a: any) => s + Number(a.commitment_cents), 0) / 100, adm.reduce((s: number, a: any) => s + Number(a.opening_capital_cents), 0) / 100);
