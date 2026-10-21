const { fetchSessionDecision } = await import("@/lib/kyc-verification.server");
const d: any = await fetchSessionDecision("60327733-1d91-4cd5-b8a5-a3f1b7b89464");
if (!d) { console.log("no decision"); process.exit(0); }
const idv = d.id_verification ?? (d.id_verifications ?? [])[0];
console.log(JSON.stringify({
  status: d.status,
  workflow: d.workflow_id,
  created: d.created_at,
  idv: idv ? { status: idv.status, first: idv.first_name, last: idv.last_name, dob: idv.date_of_birth, doc: idv.document_type, expiry: idv.expiration_date, state: idv.issuing_state ?? idv.issuing_region } : null,
  liveness: d.liveness?.status ?? d.liveness_status,
  face_match: d.face_match ? { status: d.face_match.status, score: d.face_match.score } : null,
  aml: d.aml ? { status: d.aml.status, hits: d.aml.total_hits ?? d.aml.hits?.length } : null,
  email: (d.email_verifications ?? [])[0]?.email ?? d.email?.email,
  warnings: d.warnings,
  vendor_data: d.vendor_data,
}, null, 1));
