/**
 * Fund manager setup submissions. A fund's manager submits Fund details, Fees & team,
 * bank (wire instructions file) and documents. Fund details and Fees save directly (self-serve);
 * bank and documents still need Harmonious approval, which
 * approval applies the values through the canonical Fund Setup services as the reviewer,
 * so the same checks, history and auto-completion run as when staff enter them.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { setupActor, forbid } from "@/lib/fund-setup.server";

const db = () => supabaseAdmin as any;
const BUCKET = "fund-formation";
export const SUBMISSION_DOC_KINDS = ["ein_letter", "signed_w9", "operating_agreement", "ppm", "subscription_agreement", "other"] as const;
export type SubmissionDocKind = (typeof SUBMISSION_DOC_KINDS)[number];

async function actorFor(userId: string, offeringId: string) {
  const a = await setupActor(userId);
  if (!a.isStaff && !a.offeringIds.includes(offeringId)) forbid("you do not manage that fund.");
  return a;
}

function safeName(n: string) { return n.replace(/[^\w.\-]+/g, "_").slice(0, 120); }

export async function listSubmissions(userId: string, offeringId: string) {
  const a = await actorFor(userId, offeringId);
  const [{ data }, onFile] = await Promise.all([
    db().from("fund_manager_submissions").select("*").eq("offering_id", offeringId).order("submitted_at", { ascending: false }).limit(100),
    setupOnFile(offeringId).catch(() => null),
  ]);
  return { isStaff: a.isStaff, items: (data ?? []) as any[], onFile };
}

/** Allow-listed snapshot of what is already on the fund record (no tax IDs or bank numbers). */
async function setupOnFile(offeringId: string) {
  const [{ data: o }, { data: fee }, { data: docs }] = await Promise.all([
    db().from("offerings").select("name, legal_entity_name, entity_type, state_formed, date_formed, principal_address, min_investment_cents, target_raise_cents, gp_entity_name, fund_signatory_person_id, signatory_title, fund_type, reg_type, offering_open_date, offering_close_date, rolling_closes").eq("id", offeringId).maybeSingle(),
    db().from("fund_fee_terms").select("management_fee_pct, carry_pct, hurdle_pct, status").eq("offering_id", offeringId).in("status", ["active", "approved"]).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db().from("offering_documents").select("title, doc_type").eq("offering_id", offeringId).limit(50),
  ]);
  let signer: string | null = null;
  if (o?.fund_signatory_person_id) {
    const { data: p } = await db().from("persons").select("*").eq("id", o.fund_signatory_person_id).maybeSingle();
    if (p) signer = [p.preferred_name ?? p.legal_first_name ?? p.first_name, p.legal_last_name ?? p.last_name].filter(Boolean).join(" ") || null;
  }
  const $ = (c: number | null | undefined) => (c ? String(Math.round(c / 100)) : "");
  const s = (v: unknown) => (v == null ? "" : String(v));
  const addr = (await import("@/lib/address")).parseAddressParts(o?.principal_address);
  return {
    fund_details: { legalName: s(o?.legal_entity_name), displayName: s(o?.name), entityType: s(o?.entity_type), jurisdiction: s(o?.state_formed), formationDate: s(o?.date_formed), principalAddress: s(o?.principal_address), addressLine1: addr.addressLine1, addressLine2: addr.addressLine2, addressCity: addr.addressCity, addressState: addr.addressState, addressZip: addr.addressZip, targetRaise: $(o?.target_raise_cents), minInvestment: $(o?.min_investment_cents), fundType: s(o?.fund_type), regType: s(o?.reg_type), gpName: s(o?.gp_entity_name), offeringOpenDate: s(o?.offering_open_date), offeringCloseDate: s(o?.offering_close_date), arbitrationCity: s(o?.arbitration_city), arbitrationState: s(o?.arbitration_state), rollingCloses: o?.rolling_closes == null ? "" : o.rolling_closes ? "yes" : "no" },
    fees_team: { managementFeePercent: s(fee?.management_fee_pct), carryPercent: s(fee?.carry_pct), preferredReturnPercent: s(fee?.hurdle_pct), gpName: s(o?.gp_entity_name), signers: signer ? `${signer}${o?.signatory_title ? `, ${o.signatory_title}` : ""}` : "" },
    bank: {} as Record<string, string>,
    documents: ((docs ?? []) as any[]).map((d) => String(d.title ?? d.doc_type ?? "Document")),
  };
}

export async function submit(userId: string, input: { offeringId: string; section: "fund_details" | "fees_team" | "bank" | "document"; docKind?: SubmissionDocKind | null; payload: Record<string, unknown>; file?: { name: string; base64: string } | null }) {
  const actor = await actorFor(userId, input.offeringId);
  if ((input.section === "document" || input.section === "bank") && !input.file) throw new Error("Attach the file.");
  if (input.section === "document" && !input.docKind) throw new Error("Choose the document type.");
  if (input.section === "document" && input.docKind === "ein_letter" && !/^\d{2}-?\d{7}$/.test(String(input.payload["ein"] ?? "").trim())) throw new Error("Enter the 9-digit EIN shown on the letter.");
  let filePath: string | null = null;
  if (input.file) {
    const bytes = Buffer.from(input.file.base64, "base64");
    if (bytes.length > 10 * 1024 * 1024) throw new Error("Files must be 10 MB or smaller.");
    filePath = `fund-setup-restricted/${input.offeringId}/manager/${Date.now()}-${safeName(input.file.name)}`;
    const { error } = await db().storage.from(BUCKET).upload(filePath, bytes, { contentType: input.file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream" });
    if (error) throw new Error(error.message);
  }
  // Supersede an earlier pending submission of the same kind so reviewers see only the latest.
  let q = db().from("fund_manager_submissions").update({ status: "withdrawn" }).eq("offering_id", input.offeringId).eq("section", input.section).eq("status", "submitted");
  if (input.docKind) q = q.eq("doc_kind", input.docKind);
  await q;
  const { data, error } = await db().from("fund_manager_submissions").insert({
    offering_id: input.offeringId, section: input.section, doc_kind: input.docKind ?? null,
    payload: input.payload, file_path: filePath, file_name: input.file?.name ?? null, submitted_by: userId,
  }).select("id").single();
  if (error) throw new Error(error.message);
  // Self-serve: Fund details and Fees save straight away for the fund's manager, through the
  // same canonical services (validation + history). Bank and documents still go to review.
  if (!actor.isStaff && (input.section === "fund_details" || input.section === "fees_team")) {
    try {
      const { runSelfServe } = await import("@/lib/self-serve.server");
      await runSelfServe({ userId, offeringId: input.offeringId, scope: "fund_setup" }, () => apply(null, userId, { offering_id: input.offeringId, section: input.section, payload: input.payload }));
      await db().from("fund_manager_submissions").update({ status: "approved", reviewed_by: userId, reviewed_at: new Date().toISOString(), review_note: "Self-serve: saved directly by the fund manager" }).eq("id", data.id);
      await (await import("@/lib/fund-setup-extras.server")).autoCompleteAfterSave({ offeringId: input.offeringId }).catch(() => null);
      return { id: data.id, applied: true };
    } catch (e) {
      console.error("self-serve apply failed; sending to review", e);
    }
  }
  await db().from("staff_tasks").insert({
    title: `Review fund manager submission: ${label(input.section, input.docKind)}`,
    description: "A fund manager submitted setup information. Review it on the fund's Setup tab.",
    offering_id: input.offeringId, priority: "high", status: "open", created_by: userId, team: "operations",
    responsibility_status: "HARMONIOUS_HANDLING", related_workflow_type: "fund_manager_submission", related_workflow_id: data.id, source: "workflow",
  } as any).then(() => null, () => null);
  await (await import("@/lib/ops-slack-notify.server")).notifySubmission({ kind: "fund_manager_submission", title: `Fund manager submitted: ${label(input.section, input.docKind)}`, offeringId: input.offeringId, submittedBy: userId, ref: data.id, path: `/ops/fund-setup/${input.offeringId}` });
  return { id: data.id, applied: false };
}

export function label(section: string, docKind?: string | null) {
  if (section === "document") return ({ ein_letter: "EIN letter", signed_w9: "Signed W-9", operating_agreement: "Operating Agreement", ppm: "PPM", subscription_agreement: "Subscription Agreement", other: "Document" } as Record<string, string>)[docKind ?? "other"] ?? "Document";
  return ({ fund_details: "Fund details", fees_team: "Fees & team", bank: "Bank / wire instructions" } as Record<string, string>)[section] ?? section;
}

export async function fileLink(userId: string, id: string) {
  const { data: s } = await db().from("fund_manager_submissions").select("offering_id, file_path").eq("id", id).maybeSingle();
  if (!s?.file_path) throw new Error("No file.");
  await actorFor(userId, s.offering_id);
  const { data } = await db().storage.from(BUCKET).createSignedUrl(s.file_path, 300);
  return { url: data?.signedUrl as string };
}

export async function review(sb: any, userId: string, input: { id: string; decision: "approve" | "return"; note?: string | null | undefined }) {
  const { data: s } = await db().from("fund_manager_submissions").select("*").eq("id", input.id).maybeSingle();
  if (!s) throw new Error("Submission not found.");
  const a = await actorFor(userId, s.offering_id);
  if (!a.isStaff) forbid("only Harmonious reviews fund manager submissions.");
  if (s.submitted_by === userId && !(await (await import("@/lib/self-approval.server")).selfApprove(userId, "manager_submission", [s.id]))) forbid("someone other than the submitter must review it.");
  if (s.status !== "submitted") throw new Error("This submission was already handled.");
  if (input.decision === "return" && !input.note?.trim()) throw new Error("Tell the fund manager what to fix.");
  if (input.decision === "approve") await apply(sb, userId, s);
  await db().from("fund_manager_submissions").update({ status: input.decision === "approve" ? "approved" : "returned", reviewed_by: userId, reviewed_at: new Date().toISOString(), review_note: input.note?.trim() || null }).eq("id", s.id);
  await db().from("staff_tasks").update({ status: "done" } as any).eq("offering_id", s.offering_id).eq("title", `Review fund manager submission: ${label(s.section, s.doc_kind)}`).neq("status", "done");
  await (await import("@/lib/fund-setup-extras.server")).autoCompleteAfterSave({ offeringId: s.offering_id }).catch(() => null);
  return { ok: true };
}

const num = (v: unknown) => (v === "" || v == null || Number.isNaN(Number(v)) ? null : Number(v));
const cents = (v: unknown) => { const n = num(v); return n == null ? null : Math.round(n * 100); };

/** Staff-side save through the same canonical path used when approving a submission. */
export async function applySection(sb: any, userId: string, s: { offering_id: string; section: string; payload: Record<string, unknown> }) {
  return apply(sb, userId, s);
}

async function apply(sb: any, userId: string, s: any): Promise<unknown> {
  const p: any = s.payload ?? {};
  const canon = await import("@/lib/fund-setup-canonical.server");
  if (s.section === "fund_details") {
    const fields: Record<string, unknown> = {};
    if (p.displayName) fields["displayName"] = String(p.displayName);
    for (const k of ["entityType", "jurisdiction", "formationDate", "gpName", "regType", "fundType", "offeringOpenDate", "offeringCloseDate", "arbitrationCity", "arbitrationState"]) if (p[k]) fields[k] = String(p[k]);
    // The address is edited as separate fields but stored as one line on the fund record.
    const partKeys = ["addressLine1", "addressLine2", "addressCity", "addressState", "addressZip"] as const;
    if (partKeys.some((k) => p[k])) {
      const { data: cur } = await db().from("offerings").select("principal_address").eq("id", s.offering_id).maybeSingle();
      const merged = (await import("@/lib/address")).parseAddressParts(cur?.principal_address);
      for (const k of partKeys) if (p[k]) merged[k] = String(p[k]);
      fields["principalAddress"] = (await import("@/lib/address")).composeAddress(merged);
    } else if (p.principalAddress) fields["principalAddress"] = String(p.principalAddress);
    if (p.rollingCloses === "yes" || p.rollingCloses === "no") fields["rollingCloses"] = p.rollingCloses === "yes";
    if (p.targetRaise !== undefined && p.targetRaise !== "") fields["targetRaiseCents"] = cents(p.targetRaise);
    if (p.minInvestment !== undefined && p.minInvestment !== "") fields["minInvestmentCents"] = cents(p.minInvestment) ?? 0;
    await canon.saveFundSetupFields(userId, { offeringId: s.offering_id, fields });
    if (p.legalName) {
      const { data: o } = await db().from("offerings").select("legal_entity_name").eq("id", s.offering_id).maybeSingle();
      if ((o?.legal_entity_name ?? "") !== p.legalName) await (canon as any).changeLegalName(userId, { offeringId: s.offering_id, legalName: String(p.legalName), reason: s.reviewed_by === undefined ? "Saved by fund manager (self-serve)" : "Submitted by fund manager; approved by Harmonious" });
    }
    return;
  }
  if (s.section === "fees_team") {
    const mf = num(p.managementFeePercent), cr = num(p.carryPercent), pr = num(p.preferredReturnPercent);
    await canon.saveFundEconomics(userId, {
      offeringId: s.offering_id,
      terms: {
        managementFee: mf == null ? null : { ratePercent: mf, basis: "committed_capital", frequency: "annual" },
        carry: cr == null ? null : { ratePercent: cr },
        preferredReturnPercent: pr,
      } as any,
      classes: [],
      changeReason: "Submitted by fund manager; approved by Harmonious",
    });
    // Team/signers are reviewed and added by Harmonious on the Team step (each person needs identity checks).
    return;
  }
  const p3 = await import("@/lib/fund-setup-phase3.server");
  if (s.section === "bank") {
    // The wire instructions file is kept for Harmonious to enter and verify through the bank-instruction controls.
    return;
  }
  if (s.doc_kind === "ein_letter") return p3.recordEin(sb, userId, { offeringId: s.offering_id, ein: String(p.ein), letterPath: s.file_path, received: false });
  if (s.doc_kind === "signed_w9") return p3.uploadSignedW9(userId, { offeringId: s.offering_id, path: s.file_path });
  if (["operating_agreement", "ppm", "subscription_agreement"].includes(s.doc_kind)) {
    const docs = await import("@/lib/offering-document-setup.server");
    const { id } = await docs.createSetupDocument(userId, { offeringId: s.offering_id, category: s.doc_kind });
    // Copy into the offering documents store; the new version still needs explicit activation.
    const { data: blob } = await db().storage.from(BUCKET).download(s.file_path);
    if (!blob) throw new Error("Could not read the uploaded file.");
    const dest = `${s.offering_id}/${Date.now()}-${safeName(s.file_name ?? "document.pdf")}`;
    const { error } = await db().storage.from("offering-files").upload(dest, blob);
    if (error) throw new Error(error.message);
    await docs.uploadDocumentVersion(userId, { documentId: id, filePath: dest, fileName: s.file_name ?? "document.pdf", fileSizeBytes: blob.size });
  }
  return null;
}
