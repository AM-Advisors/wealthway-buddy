/**
 * The signing request a signing-service webhook is about. The request id lives in
 * additional_info.sign_request_id; `source` is usually the signed *file*, whose id must
 * never be mistaken for a request id (that made every completion look unknown).
 */
export function signRequestIdFromWebhook(body: unknown): string | null {
  const b = (body ?? {}) as any;
  const info = b.additional_info ?? {};
  const candidates = [
    info.sign_request_id,
    info.sign_request?.id,
    info.sign_request?.sign_request_id,
    b.source?.type === "sign-request" || b.source?.type === "sign_request" ? b.source?.id : null,
  ];
  for (const c of candidates) {
    const v = typeof c === "string" || typeof c === "number" ? String(c).trim() : "";
    if (v) return v;
  }
  return null;
}
