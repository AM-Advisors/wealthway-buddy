import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { setupActor } from "@/lib/fund-setup.server";
import { fundW9Fill, fundW9Missing, canSignFundW9 } from "@/lib/fund-w9";
import { loadOfficialTemplate, renderOfficialTaxForm, sha256Hex } from "@/lib/irs-forms.server";
import { pngBytesFromDataUrl, type AdoptedSignatureInput } from "@/lib/adopted-signature";

const db = () => supabaseAdmin as any;
const BUCKET = "fund-formation";
/** Upload hooks only: never called by page reads, never signs or prepares a form. */
export async function requestW9AfterUpload(uid: string, fundId: string, sourceRef: string) {
  try {
    await access(uid, fundId);
    const title = "Review and sign the fund W-9";
    const { data: existing } = await db().from("staff_tasks").select("id").eq("offering_id", fundId).eq("title", title).neq("status", "done").limit(1);
    if (!existing?.length) await db().from("staff_tasks").insert({ offering_id: fundId, title, description: "A W-9 was uploaded. The fund manager must review the populated W-9 and sign it on the fund's Setup tab.", status: "open", priority: "high", team: "operations", created_by: uid, client_visibility: true, responsibility_status: "CLIENT_INFORMATION_REQUIRED", information_request_type: "signed_w9", requested_information: "Review and sign the fund W-9", related_workflow_type: "fund_w9_signature" });
    const { data: managers } = await db().from("fund_managers").select("user_id").eq("offering_id", fundId);
    const ids = (managers ?? []).map((m: any) => m.user_id).filter((id: string) => id !== uid);
    const { data: profiles } = ids.length ? await db().from("profiles").select("user_id, legal_name, email").in("user_id", ids) : { data: [] };
    for (const p of profiles ?? []) if (p.email) await (await import("@/lib/signing-reminder.server")).sendSigningReminder(uid, { offeringId: fundId, reminderKey: `fund-w9-upload:${sourceRef}:${p.user_id}`, documentTitle: "Fund Form W-9", recipientEmail: p.email, recipientName: p.legal_name || "Fund manager", recipientUserId: p.user_id, path: `/manager/fund/${fundId}?tab=setup`, steps: ["Open the fund W-9", "Review the saved fund details", "Sign as the fund manager"] }).catch(() => null);
  } catch { /* best-effort notice must not fail an upload */ }
}
async function access(uid: string, fundId: string) {
  const actor = await setupActor(uid);
  const { data: manager, error } = await db().from("fund_managers").select("user_id").eq("offering_id", fundId).eq("user_id", uid).maybeSingle();
  if (error || (!actor.isStaff && !manager)) throw new Error("Only Harmonious or this fund's assigned manager can open the W-9.");
  return { staff: actor.isStaff, assigned: !!manager };
}
async function facts(sb: any, fundId: string) {
  const [{ data: fund, error }, { data: entity, error: entityError }] = await Promise.all([
    db().from("offerings").select("legal_entity_name, principal_address, tax_classification").eq("id", fundId).single(),
    sb.rpc("get_offering_entity_details", { p_offering_id: fundId }).maybeSingle(),
  ]);
  if (error || entityError) throw new Error("The fund's tax details could not be loaded.");
  return fundW9Fill(fund, String(entity?.ein ?? ""));
}
async function url(path: string) {
  const { data, error } = await db().storage.from(BUCKET).createSignedUrl(path, 300);
  if (error) throw new Error("The W-9 could not be opened.");
  return data.signedUrl as string;
}
export async function w9State(sb: any, uid: string, fundId: string) {
  const a = await access(uid, fundId);
  const fill = await facts(sb, fundId);
  const [{ data: request, error }, { data: managers }, { data: tax }, { data: files }, { data: setup }] = await Promise.all([
    db().from("fund_w9_signature_requests").select("*").eq("offering_id", fundId).neq("status", "cancelled").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db().from("fund_managers").select("user_id").eq("offering_id", fundId),
    db().from("fund_tax_documents").select("id, created_at").eq("offering_id", fundId).eq("doc_type", "w9").is("investor_user_id", null).neq("review_status", "rejected").order("created_at", { ascending: false }).limit(1),
    db().from("fund_files").select("id, created_at").eq("offering_id", fundId).in("category", ["w9", "signed_w9"]).is("deleted_at", null).order("created_at", { ascending: false }).limit(1),
    db().from("fund_setups").select("id").eq("offering_id", fundId).maybeSingle(),
  ]);
  if (error) throw new Error("W-9 signature status could not be loaded.");
  const { data: docs } = setup ? await db().from("fund_setup_documents").select("id, created_at, storage_path").eq("setup_id", setup.id).in("doc_type", ["w9", "signed_w9"]).eq("is_current", true).order("created_at", { ascending: false }).limit(1) : { data: [] };
  const { data: submissions } = await db().from("fund_manager_submissions").select("id, submitted_at").eq("offering_id", fundId).eq("doc_kind", "signed_w9").in("status", ["submitted", "approved"]).order("submitted_at", { ascending: false }).limit(1);
  const sources = [...(tax ?? []).map((x: any) => ({ ...x, ref: `fund_tax_documents:${x.id}` })), ...(files ?? []).map((x: any) => ({ ...x, ref: `fund_files:${x.id}` })), ...(docs ?? []).filter((x: any) => x.storage_path !== request?.signed_path).map((x: any) => ({ ...x, ref: `fund_setup_documents:${x.id}` })), ...(submissions ?? []).map((x: any) => ({ ...x, created_at: x.submitted_at, ref: `fund_manager_submissions:${x.id}` }))].sort((x, y) => y.created_at.localeCompare(x.created_at));
  const source = sources[0] ?? null;
  const ids = (managers ?? []).map((x: any) => x.user_id);
  const { data: profiles } = ids.length ? await db().from("profiles").select("user_id, legal_name, email").in("user_id", ids) : { data: [] };
  const newerSource = !!source && request?.status === "signed" && source.created_at > request.created_at && source.ref !== request.source_ref;
  const displayFill = request?.status === "pending" ? request.snapshot : fill;
  return { staff: a.staff, assigned: a.assigned, me: uid, needed: !!source || String(fill.tin ?? "").length === 9, sourceRef: source?.ref ?? null, newerSource, missing: fundW9Missing(fill), details: { legalName: displayFill.legalName, address: [displayFill.addressLine, displayFill.cityStateZip].filter(Boolean).join(", "), classification: [displayFill.federalClassification, displayFill.llcClass].filter(Boolean).join(" "), ein: `••-•••${String(fill.tin ?? "").slice(-4)}` }, managers: (profiles ?? []).map((p: any) => ({ id: p.user_id as string, name: (p.legal_name || p.email) as string })), request: request ? { id: request.id as string, status: request.status as string, signerId: request.signer_user_id as string, signedAt: request.signed_at as string | null, signedName: request.signed_name as string | null, url: await url(request.signed_path || request.preview_path) } : null };
}
export async function prepareW9(sb: any, uid: string, fundId: string, signerId: string, classification: string, llcClass?: "C" | "S" | "P") {
  const a = await access(uid, fundId);
  if (!a.staff && signerId !== uid) throw new Error("You may prepare a W-9 only for your own signature.");
  const { data: manager } = await db().from("fund_managers").select("user_id").eq("offering_id", fundId).eq("user_id", signerId).maybeSingle();
  if (!manager) throw new Error("Select a manager assigned to this fund.");
  const state = await w9State(sb, uid, fundId);
  if (state.request?.status === "pending") return { id: state.request.id };
  if (state.request?.status === "signed" && !state.newerSource) throw new Error("The current W-9 is already signed.");
  const fill = await facts(sb, fundId);
  const { data: setup } = await db().from("fund_setups").select("id").eq("offering_id", fundId).maybeSingle();
  if (!setup) throw new Error("Save the fund setup before preparing its W-9.");
  fill.federalClassification = classification as typeof fill.federalClassification;
  fill.llcClass = classification === "llc" ? llcClass : null;
  const missing = fundW9Missing(fill);
  if (classification === "llc" && !llcClass) missing.push("LLC federal tax classification");
  if (missing.length) throw new Error(`Complete these fund details first: ${missing.join(", ")}.`);
  const template = await loadOfficialTemplate("w9");
  const bytes = await renderOfficialTaxForm({ formType: "w9", template: template.bytes, templateSha256: template.sha256, fill, signature: null });
  const id = crypto.randomUUID();
  const path = `fund-setup-restricted/${fundId}/w9/${id}/preview.pdf`;
  const { error: uploadError } = await db().storage.from(BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: false });
  if (uploadError) throw new Error("The W-9 preview could not be saved.");
  const { tin: _tin, ...snapshot } = fill;
  const { error } = await db().from("fund_w9_signature_requests").insert({ id, offering_id: fundId, signer_user_id: signerId, source_ref: state.sourceRef, snapshot, preview_path: path, preview_sha256: await sha256Hex(bytes), created_by: uid });
  if (error) throw new Error("The W-9 request could not be saved. Refresh to check for an existing request.");
  await (await import("@/lib/fund-audit.server")).logFundAudit(uid, { offeringId: fundId, eventType: "fund_w9_prepared", summary: "Fund W-9 prepared for manager signature", values: { requestId: id } });
  const { data: profile } = await db().from("profiles").select("legal_name, email").eq("user_id", signerId).maybeSingle();
  if (a.staff && signerId !== uid && profile?.email) {
    await (await import("@/lib/signing-reminder.server")).sendSigningReminder(uid, { offeringId: fundId, reminderKey: `fund-w9:${id}`, documentTitle: "Fund Form W-9", recipientEmail: profile.email, recipientName: profile.legal_name || "Fund manager", recipientUserId: signerId, path: `/manager/fund/${fundId}?tab=setup`, steps: ["Review your fund's W-9", "Confirm the fund details", "Sign"] }).catch(() => null);
  }
  return { id };
}
export async function signW9(uid: string, fundId: string, requestId: string, signedName: string, signature: AdoptedSignatureInput) {
  const a = await access(uid, fundId);
  const { data: r, error } = await db().from("fund_w9_signature_requests").select("*").eq("id", requestId).eq("offering_id", fundId).single();
  if (error || !r || !canSignFundW9(uid, r.signer_user_id, a.assigned, r.status)) throw new Error("Only the assigned fund manager may sign this pending W-9.");
  const { data: blob } = await db().storage.from(BUCKET).download(r.preview_path);
  if (!blob) throw new Error("The reviewed W-9 is unavailable.");
  const preview = new Uint8Array(await blob.arrayBuffer());
  if (await sha256Hex(preview) !== r.preview_sha256) throw new Error("The reviewed W-9 changed. Prepare a new version.");
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const pdf = await PDFDocument.load(preview);
  // Remove the renderer's unsigned-preview record; replace it with the signature record below.
  if (pdf.getPageCount() > 1) pdf.removePage(pdf.getPageCount() - 1);
  const image = await pdf.embedPng(pngBytesFromDataUrl(signature.image));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const now = new Date().toISOString();
  const page = pdf.addPage([612, 792]);
  page.drawText("Fund W-9 electronic signature record", { x: 50, y: 740, size: 16, font });
  page.drawImage(image, { x: 50, y: 610, width: 250, height: 75 });
  for (const [i, text] of [`Signed by: ${signedName}`, `Fund: ${r.snapshot.legalName}`, `Signed at (UTC): ${now}`, `Method: ${signature.method}`, `Request: ${r.id}`, "The signer adopts the certification printed on the reviewed IRS Form W-9."].entries()) page.drawText(text.slice(0, 95), { x: 50, y: 580 - i * 22, size: 10, font });
  // Place the adopted signature and date in Part II of the official W-9 as well.
  const first = pdf.getPages()[0];
  if (!first) throw new Error("The W-9 has no page.");
  first.drawImage(image, { x: 155, y: 195, width: 180, height: 28 });
  first.drawText(now.slice(0, 10), { x: 420, y: 198, size: 10, font });
  const bytes = await pdf.save();
  const path = `fund-setup-restricted/${fundId}/w9/${r.id}/signed-${crypto.randomUUID()}.pdf`;
  const { error: uploadError } = await db().storage.from(BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: false });
  if (uploadError) throw new Error("The signed W-9 could not be saved.");
  const { data: saved, error: saveError } = await db().from("fund_w9_signature_requests").update({ status: "signed", signed_path: path, signed_sha256: await sha256Hex(bytes), signed_name: signedName, signature_method: signature.method, signed_at: now }).eq("id", r.id).eq("status", "pending").select("id");
  if (saveError || !saved?.length) throw new Error("The W-9 was already signed or could not be saved.");
  await (await import("@/lib/fund-setup-phase3.server")).recordManagerSignedW9(uid, fundId, path);
  await db().from("staff_tasks").update({ status: "done" }).eq("offering_id", fundId).eq("title", "Review and sign the fund W-9").neq("status", "done");
  await (await import("@/lib/fund-audit.server")).logFundAudit(uid, { offeringId: fundId, eventType: "fund_w9_signed", summary: "Fund manager signed the fund W-9", values: { requestId: r.id, signedAt: now } });
  await (await import("@/lib/ops-slack-notify.server")).notifySubmission({ kind: "fund_w9_signed", title: "Fund W-9 signed", offeringId: fundId, submittedBy: uid, ref: r.id, path: `/ops/fund/${fundId}?tab=setup`, completed: true }).catch(() => null);
  return { ok: true };
}

export async function cancelW9(uid: string, fundId: string, requestId: string) {
  const a = await access(uid, fundId);
  const { data: r } = await db().from("fund_w9_signature_requests").select("signer_user_id, status").eq("id", requestId).eq("offering_id", fundId).maybeSingle();
  if (!r || r.status !== "pending" || (!a.staff && r.signer_user_id !== uid)) throw new Error("Only an unsigned W-9 request may be cancelled by Harmonious or its assigned signer.");
  const { error } = await db().from("fund_w9_signature_requests").update({ status: "cancelled" }).eq("id", requestId).eq("status", "pending");
  if (error) throw new Error("The W-9 request could not be cancelled.");
  await (await import("@/lib/fund-audit.server")).logFundAudit(uid, { offeringId: fundId, eventType: "fund_w9_cancelled", summary: "Unsigned fund W-9 request cancelled; original preserved", values: { requestId } });
  return { ok: true };
}