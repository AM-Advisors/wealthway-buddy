/**
 * Signature checks for documents loaded per investor (prior_signed_documents).
 * The AI reads signature pages; results append to prior_doc_signature_reviews.
 * Never sends email; the missing party is asked only when someone clicks send.
 */
import { evaluateSignatures, needsSignatureCheck, SIGNATURE_ROLES, type ExpectedSigner, type ReadResult, type SignerRole, type SignatureState } from "@/lib/prior-doc-signatures";

const BUCKET = "signed-documents";
const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
const nm = (p: any) => [p?.legal_first_name, p?.legal_last_name].filter(Boolean).join(" ").trim() || null;

async function expectedSigners(d: any, onboardingId: string, kind: string): Promise<{ expected: ExpectedSigner[]; managerUserId: string | null }> {
  const { data: ob } = await d.from("investor_onboardings").select("offering_id, person_id, investment_profile_id, investor_user_id").eq("id", onboardingId).maybeSingle();
  const [{ data: person }, { data: rels }, { data: off }] = await Promise.all([
    ob?.person_id ? d.from("persons").select("legal_first_name, legal_last_name").eq("id", ob.person_id).maybeSingle() : { data: null },
    ob?.investment_profile_id ? d.from("investment_profile_relationships").select("is_authorized_signer, is_tax_form_signer, persons:person_id(legal_first_name, legal_last_name)").eq("profile_id", ob.investment_profile_id).neq("status", "removed") : { data: [] },
    d.from("offerings").select("fund_signatory_person_id").eq("id", ob?.offering_id).maybeSingle(),
  ]);
  const signers = ((rels ?? []) as any[]).filter((r) => r.is_authorized_signer);
  const invSigner = (kind === "tax_form" ? signers.find((r) => r.is_tax_form_signer) : null) ?? signers[0];
  const { data: mgr } = off?.fund_signatory_person_id ? await d.from("persons").select("legal_first_name, legal_last_name, user_id").eq("id", off.fund_signatory_person_id).maybeSingle() : { data: null };
  const roles = SIGNATURE_ROLES[kind] ?? [];
  return {
    expected: roles.map((role) => ({ role, name: role === "investor" ? nm(invSigner?.persons) ?? nm(person) : nm(mgr) })),
    managerUserId: mgr?.user_id ?? null,
  };
}

async function readSignatures(bytes: ArrayBuffer, fileName: string, kind: string): Promise<ReadResult & { signedOn: string | null; investorName: string | null; fundName: string | null } | null> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return null;
  const isPdf = /\.pdf$/i.test(fileName);
  const b64 = Buffer.from(bytes).toString("base64");
  const part = isPdf ? { type: "input_file", filename: fileName.replace(/[^\w.\- ]+/g, "_").slice(0, 120), file_data: `data:application/pdf;base64,${b64}` }
    : { type: "input_image", image_url: `data:${/\.png$/i.test(fileName) ? "image/png" : "image/jpeg"};base64,${b64}` };
  const schema = { type: "object", additionalProperties: false, required: ["investor_signed", "investor_signer_name", "fund_signed", "fund_signer_name", "signed_date", "confidence"], properties: {
    investor_signed: { type: ["boolean", "null"] }, investor_signer_name: { type: ["string", "null"] },
    fund_signed: { type: ["boolean", "null"] }, fund_signer_name: { type: ["string", "null"] },
    signed_date: { type: ["string", "null"] }, confidence: { type: "string", enum: ["high", "medium", "low"] } } };
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({ model: "openai/gpt-6-astra", reasoning: { effort: "low" }, store: false,
      instructions: `You check signature pages of a fund investor's ${kind.replace(/_/g, " ")} that was completed outside our platform. Find the investor/subscriber signature block and the fund/general partner/manager acceptance or countersignature block. A block counts as signed only when it has a handwritten, drawn, typed-as-signature or e-signature mark (e.g. DocuSign, Adobe Sign, Box). An empty line is not signed. Use null when that block does not exist or you cannot tell. signed_date is the investor's signing date as YYYY-MM-DD. confidence is low for unreadable scans. Never return tax ID numbers.`,
      input: [{ role: "user", content: [part] }], text: { format: { type: "json_schema", name: "signature_check", strict: true, schema } } }),
  });
  if (!res.ok) { console.error(`signature check AI failed [${res.status}]`); return null; }
  const j: any = await res.json();
  const text = String(j?.output_text ?? (j?.output ?? []).flatMap((o: any) => o?.content ?? []).filter((c: any) => c?.type === "output_text").map((c: any) => c.text).join(""));
  try {
    const o = JSON.parse(text);
    const clean = (v: unknown) => (typeof v === "string" ? v.replace(/\d{5,}/g, "").slice(0, 200) : null);
    return { investorSigned: o.investor_signed ?? null, fundSigned: o.fund_signed ?? null, confidence: o.confidence ?? "low",
      signedOn: typeof o.signed_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.signed_date) ? o.signed_date : null,
      investorName: clean(o.investor_signer_name), fundName: clean(o.fund_signer_name) };
  } catch { return null; }
}

/** Read one loaded document and append its signature review. Safe to call repeatedly. */
export async function analyzePriorDoc(documentId: string, actorUserId: string | null) {
  const d = await admin();
  const { data: doc } = await d.from("prior_signed_documents").select("id, onboarding_id, offering_id, document_kind, storage_path, file_name").eq("id", documentId).maybeSingle();
  if (!doc || !needsSignatureCheck(doc.document_kind)) return null;
  const { expected } = await expectedSigners(d, doc.onboarding_id, doc.document_kind);
  let read: Awaited<ReturnType<typeof readSignatures>> = null;
  const { data: blob } = await d.storage.from(BUCKET).download(doc.storage_path);
  if (blob && blob.size < 18_000_000) read = await readSignatures(await blob.arrayBuffer(), doc.file_name ?? "document.pdf", doc.document_kind).catch(() => null);
  const r = evaluateSignatures({ expected, read });
  await d.from("prior_doc_signature_reviews").insert({
    document_id: doc.id, onboarding_id: doc.onboarding_id, offering_id: doc.offering_id, source: "ai", state: r.state,
    expected, found: r.found, missing: r.missing, signed_on: read?.signedOn ?? null, confidence: read?.confidence ?? null,
    details: { investorSignerName: read?.investorName ?? null, fundSignerName: read?.fundName ?? null, unreadable: !read }, actor_user_id: actorUserId,
  });
  if (doc.document_kind === "subscription_agreement") {
    const { reconcileOutside } = await import("@/lib/prior-signed-documents.server");
    await reconcileOutside(doc.onboarding_id, actorUserId ?? "");
  }
  return r.state;
}

export type PriorDocSignatureState = { state: SignatureState; missing: ExpectedSigner[]; signedOn: string | null; confirmedBy: string | null; signingSent: boolean };

/** Current signature state per loaded document (latest review, plus completed platform signing of the missing party). */
export async function priorDocSignatureStates(onboardingIds: string[]): Promise<Map<string, PriorDocSignatureState>> {
  const out = new Map<string, PriorDocSignatureState>();
  const ids = [...new Set(onboardingIds)]; if (!ids.length) return out;
  const d = await admin(); const rows: any[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const r = await d.from("prior_doc_signature_reviews").select("*").in("onboarding_id", ids.slice(i, i + 100)).order("created_at", { ascending: false });
    if (r.error) { console.error("signature reviews read failed (treated as none)"); continue; }
    rows.push(...(r.data ?? []));
  }
  const latest = new Map<string, any>(); const fileByDoc = new Map<string, string>();
  for (const r of rows) { if (!latest.has(r.document_id)) latest.set(r.document_id, r); if (r.signing_file_id && !fileByDoc.has(r.document_id)) fileByDoc.set(r.document_id, r.signing_file_id); }
  const files = [...new Set(fileByDoc.values())];
  const { data: sigs } = files.length ? await d.from("fund_file_signatures").select("file_id, signer_role, status").in("file_id", files).eq("status", "signed") : { data: [] };
  for (const [docId, r] of latest) {
    const fid = fileByDoc.get(docId);
    const platformSigned = ((sigs ?? []) as any[]).filter((s) => s.file_id === fid).map((s) => s.signer_role as SignerRole);
    const missing = ((r.missing ?? []) as ExpectedSigner[]).filter((m) => !platformSigned.includes(m.role));
    const state: SignatureState = r.state === "complete" || !missing.length ? "complete" : r.state;
    out.set(docId, { state, missing: state === "complete" ? [] : missing, signedOn: r.signed_on ?? null, confirmedBy: r.source === "confirmed" ? "confirmed" : null, signingSent: Boolean(fid) });
  }
  return out;
}

/** A person checked the file: record it complete (reasoned, append-only). */
export async function confirmPriorDocSignatures(userId: string, input: { fundId: string; onboardingId: string; documentId: string; complete: boolean; note: string }) {
  const d = await admin();
  const { access } = await import("@/lib/prior-signed-documents.server");
  const role = await access(d, userId, input.fundId, input.onboardingId);
  const { data: doc } = await d.from("prior_signed_documents").select("id, onboarding_id, document_kind").eq("id", input.documentId).maybeSingle();
  if (!doc || doc.onboarding_id !== input.onboardingId) throw new Error("That document wasn't found.");
  const { expected } = await expectedSigners(d, doc.onboarding_id, doc.document_kind);
  const prev = (await priorDocSignatureStates([doc.onboarding_id])).get(doc.id);
  const missing = input.complete ? [] : (prev?.missing.length ? prev.missing : expected);
  await d.from("prior_doc_signature_reviews").insert({ document_id: doc.id, onboarding_id: doc.onboarding_id, offering_id: input.fundId, source: "confirmed",
    state: input.complete ? "complete" : "waiting", expected, found: expected.filter((e) => !missing.some((m) => m.role === e.role)).map((e) => e.role), missing,
    signed_on: prev?.signedOn ?? null, details: { note: input.note.trim().slice(0, 500), confirmedByRole: role }, actor_user_id: userId });
  if (doc.document_kind === "subscription_agreement") { const { reconcileOutside } = await import("@/lib/prior-signed-documents.server"); await reconcileOutside(doc.onboarding_id, userId); }
  return { ok: true };
}

/** Copy the loaded file into a fund document so the missing party gets the usual sign link (sent by the caller). */
export async function prepareMissingSignature(userId: string, input: { fundId: string; onboardingId: string; documentId: string }) {
  const d = await admin();
  const { access } = await import("@/lib/prior-signed-documents.server");
  await access(d, userId, input.fundId, input.onboardingId);
  const { data: doc } = await d.from("prior_signed_documents").select("id, onboarding_id, document_kind, title, storage_path, file_name").eq("id", input.documentId).maybeSingle();
  if (!doc || doc.onboarding_id !== input.onboardingId) throw new Error("That document wasn't found.");
  const st = (await priorDocSignatureStates([doc.onboarding_id])).get(doc.id);
  if (!st || st.state === "complete" || !st.missing.length) throw new Error("No signature is missing on this document.");
  if (!/\.pdf$/i.test(doc.file_name ?? "")) throw new Error("Load the document as a PDF to collect the missing signature.");
  const { data: blob } = await d.storage.from(BUCKET).download(doc.storage_path);
  if (!blob) throw new Error("The loaded file couldn't be opened.");
  const path = `${input.fundId}/missing-signatures/${doc.id}-${crypto.randomUUID()}.pdf`;
  const up = await d.storage.from("manager-uploads").upload(path, blob, { contentType: "application/pdf", upsert: false });
  if (up.error) throw new Error("The file couldn't be prepared for signing.");
  const { data: f, error } = await d.from("fund_files").insert({ offering_id: input.fundId, title: `${doc.title} (missing signature)`, category: "legal", file_name: doc.file_name, storage_path: path, content_type: "application/pdf", status: "draft", uploaded_by: userId }).select("id").single();
  if (error) throw new Error(error.message);
  const roles = st.missing.map((m) => m.role);
  const order = roles.includes("investor") && roles.includes("fund_manager") ? "investor_first" : roles.includes("investor") ? "investor_only" : "manager_only";
  const { expected, managerUserId } = await expectedSigners(d, doc.onboarding_id, doc.document_kind);
  if (roles.includes("fund_manager") && !managerUserId) throw new Error("The fund's signatory has no login yet, so they can't be sent a sign link.");
  await d.from("prior_doc_signature_reviews").insert({ document_id: doc.id, onboarding_id: doc.onboarding_id, offering_id: input.fundId, source: "signing_request", state: "waiting", expected, found: expected.filter((e) => !roles.includes(e.role)).map((e) => e.role), missing: st.missing, signed_on: st.signedOn, signing_file_id: f.id, actor_user_id: userId });
  return { fileId: f.id as string, order, managerUserId, missing: st.missing };
}

/** Staff catch-up: read every loaded signable document that has no review yet. No emails. */
export async function catchUpPriorDocSignatures(userId: string, input: { limit: number }) {
  const d = await admin();
  const { data: roles } = await d.from("user_roles").select("role").eq("user_id", userId);
  if (!((roles ?? []) as any[]).some((r) => ["admin", "super_admin", "operations", "fund_administration"].includes(r.role))) throw new Error("Only Harmonious operations can run this.");
  const { data: docs } = await d.from("prior_signed_documents").select("id, onboarding_id, document_kind").in("document_kind", Object.keys(SIGNATURE_ROLES)).order("created_at");
  const { data: done } = await d.from("prior_doc_signature_reviews").select("document_id");
  const reviewed = new Set(((done ?? []) as any[]).map((r) => r.document_id));
  const todo = ((docs ?? []) as any[]).filter((x) => !reviewed.has(x.id));
  const batch = todo.slice(0, Math.min(input.limit, 10));
  for (const doc of batch) await analyzePriorDoc(doc.id, userId).catch((e) => console.error("catch-up read failed", (e as Error).message));
  return { processed: batch.length, remaining: todo.length - batch.length };
}

/** Summary rows for the catch-up download. */
export async function priorDocSignatureSummary(userId: string) {
  const d = await admin();
  const { data: roles } = await d.from("user_roles").select("role").eq("user_id", userId);
  if (!((roles ?? []) as any[]).some((r) => ["admin", "super_admin", "operations", "fund_administration"].includes(r.role))) throw new Error("Only Harmonious operations can see this.");
  const { data: docs } = await d.from("prior_signed_documents").select("id, onboarding_id, offering_id, document_kind, title, offerings:offering_id(name), investor_onboardings:onboarding_id(investment_profiles:investment_profile_id(display_label, legal_name), persons:person_id(legal_first_name, legal_last_name))").in("document_kind", Object.keys(SIGNATURE_ROLES));
  const states = await priorDocSignatureStates(((docs ?? []) as any[]).map((x) => x.onboarding_id));
  return ((docs ?? []) as any[]).map((x) => {
    const s = states.get(x.id);
    const io = x.investor_onboardings;
    return { fund: x.offerings?.name ?? "", investor: io?.investment_profiles?.legal_name || io?.investment_profiles?.display_label || nm(io?.persons) || "", document: x.title, kind: x.document_kind,
      state: s?.state ?? "not_read", waitingOn: (s?.missing ?? []).map((m) => m.name || m.role).join("; "), signedOn: s?.signedOn ?? "" };
  });
}
