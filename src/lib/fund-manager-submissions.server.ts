/**
 * Fund manager setup submissions. A fund's manager submits Fund details, Fees & team,
 * bank (wire instructions file) and documents. Nothing counts until Harmonious approves:
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
  const { data } = await db().from("fund_manager_submissions").select("*").eq("offering_id", offeringId).order("submitted_at", { ascending: false }).limit(100);
  return { isStaff: a.isStaff, items: (data ?? []) as any[] };
}

export async function submit(userId: string, input: { offeringId: string; section: "fund_details" | "fees_team" | "bank" | "document"; docKind?: SubmissionDocKind | null; payload: Record<string, unknown>; file?: { name: string; base64: string } | null }) {
  await actorFor(userId, input.offeringId);
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
  await db().from("staff_tasks").insert({
    title: `Review fund manager submission: ${label(input.section, input.docKind)}`,
    description: "A fund manager submitted setup information. Review it on the fund's Setup tab.",
    offering_id: input.offeringId, priority: "high", status: "open",
  } as any).then(() => null, () => null);
  return { id: data.id };
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

export async function review(sb: any, userId: string, input: { id: string; decision: "approve" | "return"; note?: string | null }) {
  const { data: s } = await db().from("fund_manager_submissions").select("*").eq("id", input.id).maybeSingle();
  if (!s) throw new Error("Submission not found.");
  const a = await actorFor(userId, s.offering_id);
  if (!a.isStaff) forbid("only Harmonious reviews fund manager submissions.");
  if (s.submitted_by === userId) forbid("someone other than the submitter must review it.");
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

async function apply(sb: any, userId: string, s: any) {
  const p = (s.payload ?? {}) as Record<string, any>;
  const canon = await import("@/lib/fund-setup-canonical.server");
  if (s.section === "fund_details") {
    const fields: Record<string, unknown> = {};
    if (p.displayName) fields["displayName"] = String(p.displayName);
    for (const k of ["entityType", "jurisdiction", "formationDate", "principalAddress", "gpName"]) if (p[k]) fields[k] = String(p[k]);
    if (p.targetRaise !== undefined && p.targetRaise !== "") fields["targetRaiseCents"] = cents(p.targetRaise);
    if (p.minInvestment !== undefined && p.minInvestment !== "") fields["minInvestmentCents"] = cents(p.minInvestment) ?? 0;
    await canon.saveFundSetupFields(userId, { offeringId: s.offering_id, fields });
    if (p.legalName) {
      const { data: o } = await db().from("offerings").select("legal_entity_name").eq("id", s.offering_id).maybeSingle();
      if ((o?.legal_entity_name ?? "") !== p.legalName) await (canon as any).changeLegalName(userId, { offeringId: s.offering_id, legalName: String(p.legalName), reason: "Submitted by fund manager; approved by Harmonious" });
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
}
