import { documentReadSource } from "./offering-document-reader";
import { fillSubscriptionDocx } from "./subscription-docx";

/** Called only after the caller has authorized this document and investment. */
export async function investmentDocumentSource(db: any, documentId: string, applicationId: string | null, snapshotValues?: Record<string, string>) {
  const { data: doc, error } = await db.from("offering_documents").select("id, offering_id, body, file_path, active_version, document_category, signing_mode, countersigner_user_id").eq("id", documentId).single();
  if (error || !doc) throw new Error("The agreement could not be loaded.");
  const [versions, investment, signature] = await Promise.all([
    db.from("offering_document_versions").select("id,version,file_path,file_name,target_onboarding_id,rollout_scope").eq("offering_document_id", doc.id),
    applicationId ? db.from("investor_onboardings").select("id,offering_id,investment_profile_id,person_id,investor_user_id,requested_amount_cents,accepted_amount_cents").eq("application_id", applicationId).is("removed_at", null).maybeSingle() : { data: null },
    applicationId ? db.from("document_signatures").select("signature_template_version,provider_sent_at,provider_completed_at,cancelled_at,provider_status").eq("application_id", applicationId).eq("offering_document_id", doc.id).maybeSingle() : { data: null },
  ]);
  if (versions.error || investment.error || signature.error) throw new Error("The investment agreement version could not be loaded.");
  const ob = investment.data;
  if (ob && ob.offering_id !== doc.offering_id) throw new Error("This agreement is not part of the investment.");
  const pinRequired = signature.data?.provider_completed_at || (signature.data?.provider_sent_at && !signature.data?.cancelled_at && signature.data?.provider_status !== "cancelled");
  const pinned = pinRequired
    ? (versions.data ?? []).find((v: any) => v.version === signature.data.signature_template_version)?.id : null;
  if (pinRequired && !pinned && versions.data?.length) throw new Error("The original signing version is unavailable. Contact your fund manager.");
  const source = documentReadSource(doc, versions.data ?? [], ob?.id ?? null, pinned ?? null);
  if (source.kind === "text") return { ...source, bytes: null, filename: "document.pdf" };
  const download = await db.storage.from("offering-files").download(source.path);
  if (download.error || !download.data) throw new Error("The agreement file is unavailable. Please try again.");
  let bytes = new Uint8Array(await download.data.arrayBuffer());
  if (/\.docx$/i.test(source.filename) && doc.document_category === "subscription_agreement" && ob && !pinned) {
    const [profile, person] = await Promise.all([
      ob.investment_profile_id ? db.from("investment_profiles").select("legal_name,profile_type").eq("id", ob.investment_profile_id).maybeSingle() : { data: null },
      ob.person_id ? db.from("persons").select("legal_first_name,legal_middle_name,legal_last_name").eq("id", ob.person_id).maybeSingle() : { data: null },
    ]);
    if (profile.error || person.error) throw new Error("Investor agreement details could not be loaded.");
    const name = profile.data?.legal_name || [person.data?.legal_first_name, person.data?.legal_middle_name, person.data?.legal_last_name].filter(Boolean).join(" ");
    const commitmentCents = ob.accepted_amount_cents ?? ob.requested_amount_cents ?? null;
    const amount = commitmentCents == null ? null : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(commitmentCents / 100);
    const { fundTemplateValues } = await import("./fund-doc-templates.server");
    const { subscriptionLocks } = await import("./investor-onboarding.server");
    const { PREFILL_KEYS } = await import("./subscription-prefill");
    const { locked } = await subscriptionLocks(ob, []);
    const taxForm = locked[PREFILL_KEYS.irsForm] ?? null;
    const isEntity = Boolean(profile.data?.profile_type) && !["individual", "joint"].includes(String(profile.data?.profile_type));
    const fund = await fundTemplateValues(doc.offering_id);
    const result = await fillSubscriptionDocx(bytes, {
      ...fund,
      // Investor's own commitment from About You, never the fund minimum.
      "Subscription Amount": snapshotValues?.["commitment_amount"] || amount,
      "Tax Classification": taxForm, "IRS Form": taxForm, "Subscriber Tax Form": taxForm,
      "Subscriber Type": locked[PREFILL_KEYS.businessType] ?? null,
      __investor_is_entity: isEntity ? "1" : null,
      __fund_countersigns: doc.signing_mode === "dual" && doc.countersigner_user_id && doc.countersigner_user_id !== ob.investor_user_id ? "1" : null,
      "Subscriber Legal Name": snapshotValues?.["entity_legal_name"] || snapshotValues?.["investor_legal_name"] || name,
      "Investor Subscription Amount": snapshotValues?.["commitment_amount"] || amount,
      "Investor Signer Name": snapshotValues?.["signer_name"] || (profile.data?.profile_type === "individual" ? name : null),
      "Investor Signer Title": isEntity ? snapshotValues?.["signer_title"] || null : null,
    });
    bytes = result.bytes;
  }
  return { ...source, bytes };
}