/**
 * Corps LaaSy Operating Agreement: upload the corrected DOCX (6% one-time fee
 * language matching Erebor's corrected agreement) as version 2, activate it
 * (nothing signed yet, so new_only is safe), then send it to the fund's
 * recorded signatory Thomas Morgan Jr for signature. Mirrors
 * sendTemplateDocToSignatoryFn in src/lib/fund-file-signing.functions.ts.
 */
import { readFileSync } from "node:fs";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { uploadDocumentVersion, activateDocumentVersion } from "@/lib/offering-document-setup.server";

const ALYSSA = "fcf83359-0486-402d-83b4-fd5484fb663d";
const FUND = "92252b98-c5d2-444a-8620-fb29436a87cf";
const DOC = "ce46eb3c-fbd4-41b4-8c63-f5cbf521846f";
const THOMAS_USER = "a1387cfc-46e5-4dd4-b16b-d63730123794";
const d = supabaseAdmin as any;

// 1. Upload the corrected file to storage and register it as version 2.
const bytes = readFileSync("/tmp/oa/laasy-corrected.docx");
const fileName = "Corps_LaaSy_Operating_Agreement.docx";
const dest = `${FUND}/templates/88ba9e2c-09fd-4f3a-bb8d-9ff025e3bfbc-v1-corrected-${Date.now()}-${fileName}`;
const { error: upErr } = await supabaseAdmin.storage.from("offering-files").upload(dest, bytes, {
  contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", upsert: false,
});
if (upErr) throw new Error(`upload: ${upErr.message}`);
const { version } = await uploadDocumentVersion(ALYSSA, { documentId: DOC, filePath: dest, fileName, fileSizeBytes: bytes.length });
console.log("uploaded version", version);

// 2. Activate it (unsigned document, new_only).
await activateDocumentVersion(ALYSSA, { documentId: DOC, version, scope: "new_only", note: "Corrected management-fee clause to the recorded 6% one-time fee (matches Erebor corrected agreement)." });
console.log("activated version", version);

// 3. Send to the recorded signatory, mirroring sendTemplateDocToSignatoryFn.
const { data: doc } = await d.from("offering_documents").select("id, title, offering_id, active_version, removed_at").eq("id", DOC).maybeSingle();
if (!doc || doc.removed_at || doc.active_version == null) throw new Error("Document not active.");
const { data: v } = await d.from("offering_document_versions").select("file_path, file_name").eq("offering_document_id", DOC).eq("version", doc.active_version).maybeSingle();
if (!v?.file_path) throw new Error("no file");

const { data: mgr } = await d.from("fund_managers").select("user_id").eq("offering_id", FUND).eq("user_id", THOMAS_USER).maybeSingle();
if (!mgr) throw new Error("Thomas is not a manager of this fund.");
const { data: mp } = await d.from("profiles").select("legal_name, email").eq("user_id", THOMAS_USER).maybeSingle();
if (!mp?.email) throw new Error("no email");

let body = "";
const { data: blob } = await d.storage.from("offering-files").download(v.file_path);
if (blob && /\.docx$/i.test(v.file_name ?? "")) {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const xml = (await zip.file("word/document.xml")?.async("string")) ?? "";
  body = xml.replace(/<w:tab\/>/g, "\t").replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/\n{3,}/g, "\n\n").trim();
}
if (!body) throw new Error("could not read document text");
if (/will not receive a management fee|will not collect a management fee/i.test(body)) throw new Error("corrected file still contains the no-fee clause");
if (!/one-time management fee of 6%/.test(body)) throw new Error("corrected fee clause missing");

const { data: offering } = await d.from("offerings").select("name, legal_entity_name, fund_signatory_person_id, signatory_title").eq("id", FUND).maybeSingle();
const { data: signatory } = offering.fund_signatory_person_id
  ? await d.from("persons").select("user_id, email").eq("id", offering.fund_signatory_person_id).maybeSingle()
  : { data: null };
const { operatingAgreementSignaturePage, isRecordedOperatingSignatory } = await import("@/lib/operating-agreement-signing");
if (!isRecordedOperatingSignatory(signatory, THOMAS_USER, mp.email)) throw new Error("Thomas is not the recorded signatory.");
const signaturePage = operatingAgreementSignaturePage({ title: doc.title, fundName: offering.legal_entity_name || offering.name,
  signerName: mp.legal_name || mp.email, signatoryTitle: offering.signatory_title, body });

const { data: prior } = await d.from("fund_files").select("id").eq("offering_id", FUND).eq("title", doc.title).eq("template_key", "operating_agreement").eq("status", "out_for_signature").is("deleted_at", null);
for (const p of (prior ?? []) as any[]) await d.from("fund_file_signatures").update({ status: "cancelled" }).eq("file_id", p.id).in("status", ["waiting", "sent"]);

const { data: f, error: fe } = await d.from("fund_files").insert({
  offering_id: FUND, title: doc.title, category: "legal", file_name: v.file_name, body,
  template_key: "operating_agreement", status: "draft", signing_order: "manager_only", uploaded_by: ALYSSA,
}).select("id").single();
if (fe) throw new Error(fe.message);
const { data: rows, error } = await d.from("fund_file_signatures").insert([
  { file_id: f.id, offering_id: FUND, signature_page: signaturePage, signer_role: "fund_manager", signing_order: 1, signer_name: mp.legal_name || mp.email, signer_email: String(mp.email).toLowerCase(), signer_user_id: THOMAS_USER, created_by: ALYSSA },
]).select("*");
if (error) throw new Error(error.message);
await d.from("fund_files").update({ status: "out_for_signature" }).eq("id", f.id);

// Email the signer (same template and idempotency pattern as emailSigner).
const sig = (rows as any[])[0];
const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
const { secondaryCcFor } = await import("@/lib/person-emails.server");
const SITE = "https://app.harmonious.co";
const TEAM_EMAIL = "operations@harmonious.co";
const secondary = await secondaryCcFor(sig.signer_email);
const r = await sendTemplateEmail("manager-alert", sig.signer_email, {
  idempotencyKey: `fund-file-sign:${sig.id}`,
  cc: secondary ? [TEAM_EMAIL, secondary].filter(Boolean) : TEAM_EMAIL,
  templateData: {
    managerName: sig.signer_name,
    headline: `Please sign: ${doc.title}`,
    intro: `${offering.name} has a document ready for your signature. Sign in to Harmonious with this email address to review and sign it.`,
    offeringName: offering.name,
    details: [{ label: "Document", value: doc.title }, { label: "Signing as", value: "Fund manager" }],
    portalUrl: `${SITE ?? "https://app.harmonious.co"}/sign/${sig.id}`,
  },
});
console.log("email", r.sent ? "sent" : (r as any).reason);
if (!r.sent) throw new Error("email not sent");
await d.from("fund_file_signatures").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", sig.id).eq("status", "waiting");

try {
  const { notifySubmission } = await import("@/lib/ops-slack-notify.server");
  await notifySubmission({ kind: "document_sent_for_signature", title: `${doc.title} sent to ${mp.legal_name || mp.email} to sign`, offeringId: FUND, submittedBy: ALYSSA, ref: f.id, path: `/ops/fund/${FUND}?tab=documents` } as any);
} catch { /* best-effort */ }
try {
  const { logFundAudit } = await import("@/lib/fund-audit.server");
  await logFundAudit(ALYSSA, { offeringId: FUND, eventType: "document_sent_for_signature", summary: `Sent "${doc.title}" (v${doc.active_version}) to the fund manager for signature`, values: { fundManager: mp.legal_name || mp.email, signatoryOnly: true } });
} catch { /* best-effort */ }
console.log("done", JSON.stringify({ fileId: f.id, signatureId: sig.id, signer: mp.email }));
