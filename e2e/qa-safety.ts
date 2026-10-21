/** Offline preflight policy; live backend metadata is supplied by global setup. */
const PRODUCTION_BACKEND = "cvqvbmfcckeguxpoyyzj";
export type QaEvidence = { origin: string; backendId: string; dataIsolated: boolean; reviewedBy: string; reviewedAt: string; syntheticUserIds: string[] };
export function assertQaEvidence(e: QaEvidence | undefined, actual: { environment: string; supabase_project_id: string }, base: string) {
  const blocked = () => { throw new Error("BLOCKED: independently isolated QA backend and reviewed synthetic data evidence are required."); };
  if (!e || !base || !e.backendId || !e.reviewedBy || !e.reviewedAt || !e.dataIsolated || !e.syntheticUserIds?.length) return blocked();
  let origin: string;
  try { origin = new URL(base).origin; } catch { return blocked(); }
  if (origin !== e.origin || /(^|\.)harmonious\.co$|wealthway-buddy\.lovable\.app$/.test(new URL(base).hostname)) return blocked();
  if (!Number.isFinite(Date.parse(e.reviewedAt)) || Date.now() - Date.parse(e.reviewedAt) > 864e5 || Date.parse(e.reviewedAt) > Date.now()) return blocked();
  if (e.backendId === PRODUCTION_BACKEND || actual.supabase_project_id === PRODUCTION_BACKEND || actual.environment === "production" || actual.supabase_project_id !== e.backendId) return blocked();
  return e;
}
export function parseQaSession(raw: string | undefined, evidence: QaEvidence) {
  if (!raw) throw new Error("BLOCKED: required synthetic reviewer/user session is missing.");
  try {
    const parsed = JSON.parse(raw);
    const session = parsed.session;
    const parts = String(session?.access_token ?? "").split(".");
    const claims = JSON.parse(atob((parts[1] ?? "").replace(/-/g, "+").replace(/_/g, "/")));
    if (parts.length !== 3 || !session?.refresh_token || !session?.user?.id || claims.sub !== session.user.id || !evidence.syntheticUserIds.includes(session.user.id) || claims.iss !== `https://${evidence.backendId}.supabase.co/auth/v1` || !Number.isFinite(Number(claims.exp)) || Number(claims.exp) * 1000 <= Date.now() || parsed.storage_key !== `sb-${evidence.backendId}-auth-token`) throw new Error();
    return parsed as { storage_key: string; session: { user: { id: string }; access_token: string; refresh_token: string } };
  } catch { throw new Error("BLOCKED: session is malformed, expired, or not bound to the reviewed synthetic QA backend."); }
}