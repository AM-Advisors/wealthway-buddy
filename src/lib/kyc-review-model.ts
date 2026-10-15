/**
 * Normalizes a verification-provider session decision into a stable, display-safe
 * review shape. Pure: no I/O. Never keeps image/video URLs; ID and tax numbers are
 * reduced to their last four characters.
 */
export type ReviewStatus = "pass" | "review" | "fail" | "none";

export type ReviewDetails = {
  version: 1;
  capturedAt: string;
  sessionId: string | null;
  sessionNumber: number | null;
  status: string | null;
  workflowId: string | null;
  features: string[];
  createdAt: string | null;
  environment: string | null;
  idDocument: null | {
    status: ReviewStatus; raw: string | null; type: string | null; subtype: string | null; numberLast4: string | null;
    fullName: string | null; dateOfBirth: string | null; age: number | null; gender: string | null;
    issued: string | null; expires: string | null; country: string | null; region: string | null;
    address: string | null; addressVerified: boolean | null; barcodes: string[]; warnings: string[];
    selfieToIdScore: number | null;
  };
  liveness: null | { status: ReviewStatus; raw: string | null; method: string | null; score: number | null; ageEstimate: number | null; warnings: string[] };
  faceMatch: null | { status: ReviewStatus; raw: string | null; score: number | null; warnings: string[] };
  aml: null | {
    status: ReviewStatus; raw: string | null; totalHits: number; entityType: string | null;
    hits: Array<{ caption: string | null; datasets: string[]; matchScore: number | null; riskScore: number | null; isMatch: boolean | null; reviewStatus: string | null; countries: string[]; birthDates: string[]; pep: boolean; summary: string | null; lists: string[] }>;
  };
  address: null | { status: ReviewStatus; raw: string | null; address: string | null; warnings: string[] };
  phone: null | { status: ReviewStatus; raw: string | null; numberLast4: string | null; carrier: string | null; type: string | null };
  email: null | { status: ReviewStatus; raw: string | null; email: string | null; breached: boolean | null; breaches: string[]; disposable: boolean | null; warnings: string[] };
  device: null | { status: ReviewStatus; raw: string | null; ip: string | null; city: string | null; state: string | null; country: string | null; isp: string | null; vpnOrTor: boolean | null; dataCenter: boolean | null; device: string | null; browser: string | null; os: string | null; distanceFromIdKm: number | null; warnings: string[] };
  expected: Record<string, string> | null;
  questionnaire: Array<{ question: string; answer: string }>;
  reviews: Array<{ user: string | null; newStatus: string | null; comment: string | null; at: string | null }>;
  warnings: string[];
};

const str = (v: unknown): string | null => (v == null || v === "" ? null : String(v));
const num = (v: unknown): number | null => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);
const last4 = (v: unknown) => { const s = str(v)?.replace(/\s/g, ""); return s ? s.slice(-4) : null; };
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);

export function reviewStatus(v: unknown): ReviewStatus {
  const s = String(v ?? "").toLowerCase();
  if (!s || s === "not started" || s === "not_started") return "none";
  if (/approv|pass|clear|verified/.test(s)) return "pass";
  if (/declin|fail|reject|expired|abandon/.test(s)) return "fail";
  return "review";
}

function warnText(w: any): string {
  if (typeof w === "string") return w;
  return str(w?.short_description) ?? str(w?.long_description) ?? str(w?.risk) ?? str(w?.feature) ?? "Warning";
}
const warns = (v: unknown) => arr(v).map(warnText).slice(0, 20);

export function buildReviewDetails(d: Record<string, any> | null | undefined, capturedAt = new Date().toISOString()): ReviewDetails | null {
  if (!d || typeof d !== "object") return null;
  const iv = d["id_verification"]; const lv = d["liveness"]; const fm = d["face_match"]; const aml = d["aml"];
  const poa = d["poa"]; const ph = d["phone"]; const em = d["email"]; const ip = d["ip_analysis"];
  const allWarnings = [iv, lv, fm, aml, poa, ph, em, ip].flatMap((s) => warns(s?.warnings));
  return {
    version: 1,
    capturedAt,
    sessionId: str(d["session_id"]),
    sessionNumber: num(d["session_number"]),
    status: str(d["status"]),
    workflowId: str(d["workflow_id"]),
    features: arr(d["features"]).map(String),
    createdAt: str(d["created_at"]),
    environment: str(d["environment"]),
    idDocument: iv ? {
      status: reviewStatus(iv.status), raw: str(iv.status), type: str(iv.document_type), subtype: str(iv.document_subtype)?.replace(/_/g, " ").toLowerCase() ?? null,
      numberLast4: last4(iv.document_number), fullName: str(iv.full_name), dateOfBirth: str(iv.date_of_birth), age: num(iv.age), gender: str(iv.gender),
      issued: str(iv.date_of_issue), expires: str(iv.expiration_date), country: str(iv.issuing_state_name ?? iv.issuing_state), region: str(iv.region),
      address: str(iv.formatted_address ?? iv.address), addressVerified: bool(iv.parsed_address?.is_verified),
      barcodes: arr(iv.barcodes).map((b) => `${str(b?.type) ?? "Barcode"} (${str(b?.side) ?? "?"})`),
      warnings: warns(iv.warnings),
      selfieToIdScore: num(iv.back_image_camera_front_face_match_score ?? iv.front_image_camera_front_face_match_score),
    } : null,
    liveness: lv ? { status: reviewStatus(lv.status), raw: str(lv.status), method: str(lv.method), score: num(lv.score), ageEstimate: num(lv.age_estimation), warnings: warns(lv.warnings) } : null,
    faceMatch: fm ? { status: reviewStatus(fm.status), raw: str(fm.status), score: num(fm.score), warnings: warns(fm.warnings) } : null,
    aml: aml ? {
      status: reviewStatus(aml.status), raw: str(aml.status), totalHits: num(aml.total_hits) ?? arr(aml.hits).length, entityType: str(aml.entity_type),
      hits: arr(aml.hits).slice(0, 50).map((h) => ({
        caption: str(h?.caption), datasets: arr(h?.datasets).map(String), matchScore: num(h?.match_score ?? h?.score), riskScore: num(h?.risk_score),
        isMatch: bool(h?.match), reviewStatus: str(h?.review_status), countries: arr(h?.properties?.country).map(String), birthDates: arr(h?.properties?.birthDate).map(String),
        pep: arr(h?.pep_matches).length > 0,
        summary: arr(h?.warning_matches?.[0]?.additional_data?.data?.case_details?.[0]?.crime).map(String).join(", ") || null,
        lists: arr(h?.warning_matches).map((w) => str(w?.list_name)).filter(Boolean) as string[],
      })),
    } : null,
    address: poa ? { status: reviewStatus(poa.status), raw: str(poa.status), address: str(poa.formatted_address ?? poa.poa_formatted_address ?? poa.poa_address), warnings: warns(poa.warnings) } : null,
    phone: ph ? { status: reviewStatus(ph.status), raw: str(ph.status), numberLast4: last4(ph.full_number ?? ph.phone_number), carrier: str(ph.carrier?.name ?? ph.carrier), type: str(ph.phone_number_type ?? ph.type) } : null,
    email: em ? { status: reviewStatus(em.status), raw: str(em.status), email: str(em.email), breached: bool(em.is_breached), breaches: arr(em.breaches).map((b) => [str(b?.name), str(b?.breach_date)].filter(Boolean).join(" · ")), disposable: bool(em.is_disposable), warnings: warns(em.warnings) } : null,
    device: ip ? {
      status: reviewStatus(ip.status), raw: str(ip.status), ip: str(ip.ip_address), city: str(ip.ip_city), state: str(ip.ip_state), country: str(ip.ip_country), isp: str(ip.isp),
      vpnOrTor: bool(ip.is_vpn_or_tor), dataCenter: bool(ip.is_data_center), device: [str(ip.device_brand), str(ip.device_model)].filter(Boolean).join(" ") || null,
      browser: str(ip.browser_family), os: str(ip.os_family), distanceFromIdKm: num(ip.locations_info?.ip?.distance_from_id_document?.distance), warnings: warns(ip.warnings),
    } : null,
    expected: d["expected_details"] && typeof d["expected_details"] === "object"
      ? Object.fromEntries(Object.entries(d["expected_details"]).filter(([, v]) => v != null && v !== "").map(([k, v]) => [k, String(v)])) : null,
    questionnaire: arr(d["questionnaire"]?.sections ?? d["questionnaire"]?.answers ?? d["questionnaire"]).flatMap((s: any) => arr(s?.items ?? s?.questions ?? [s]))
      .map((q: any) => ({ question: str(q?.title ?? q?.question ?? q?.label) ?? "", answer: str(Array.isArray(q?.answer) ? q.answer.join(", ") : q?.answer ?? q?.value) ?? "" }))
      .filter((q) => q.question),
    reviews: arr(d["reviews"]).map((r) => ({ user: str(r?.user), newStatus: str(r?.new_status), comment: str(r?.comment), at: str(r?.created_at) })),
    warnings: [...new Set(allWarnings)],
  };
}

/** Provider image URLs (short-lived). Returned to authorized reviewers only, never stored. */
export function extractImages(d: Record<string, any> | null | undefined): Array<{ label: string; url: string }> {
  if (!d) return [];
  const pick: Array<[string, unknown]> = [
    ["ID front", d["id_verification"]?.full_front_image ?? d["id_verification"]?.front_image],
    ["ID back", d["id_verification"]?.full_back_image ?? d["id_verification"]?.back_image],
    ["ID portrait", d["id_verification"]?.portrait_image],
    ["Live selfie", d["liveness"]?.reference_image],
    ["Face match: ID", d["face_match"]?.source_image],
    ["Face match: selfie", d["face_match"]?.target_image],
  ];
  return pick.filter(([, u]) => typeof u === "string" && /^https:\/\//.test(u as string)).map(([label, url]) => ({ label, url: url as string }));
}
