/**
 * Signatures in one place: a pure projection of the two existing signing
 * records (in-app fund file signatures and subscription signature requests)
 * plus subscriptions not opened yet. Nothing here signs, sends or changes a
 * record; status comes only from the signer rows themselves.
 */

export type AgreementKind = "side_letter" | "subscription" | "operating_agreement" | "other";
export type SignerRole = "investor" | "fund_signatory" | "other";
export type SignatureSource = "fund_file" | "subscription" | "subscription_not_started";

export type RawSigner = {
  id: string;
  name: string | null;
  email: string | null;
  userId: string | null;
  role: SignerRole;
  order: number;
  /** Raw status from the record (waiting, sent, viewed, signed, declined, ...). */
  status: string;
  sentAt: string | null;
  signedAt: string | null;
};

export type RawItem = {
  id: string;
  source: SignatureSource;
  offeringId: string;
  fundName: string;
  title: string;
  /** template_key or document type, used only to group the agreement. */
  kindHint: string | null;
  investorName: string | null;
  onboardingId: string | null;
  createdAt: string | null;
  executedAt: string | null;
  signers: RawSigner[];
};

export type SignerState = "signed" | "waiting" | "problem" | "cancelled";

export const KIND_LABELS: Record<AgreementKind, string> = {
  side_letter: "Side letter",
  subscription: "Subscription agreement",
  operating_agreement: "Operating agreement",
  other: "Other agreement",
};

export const ROLE_LABELS: Record<SignerRole, string> = {
  investor: "Investor",
  fund_signatory: "Fund signatory",
  other: "Signer",
};

/** Days without movement before Harmonious sees an item as stuck. */
export const STUCK_AFTER_DAYS = 7;

export function agreementKind(title: string | null | undefined, hint: string | null | undefined): AgreementKind {
  const h = String(hint ?? "").toLowerCase();
  const t = String(title ?? "").toLowerCase();
  if (h.startsWith("sl_") || h.includes("side_letter") || /side\s*letter/.test(t)) return "side_letter";
  if (h.includes("operating_agreement") || h === "lpa" || /operating agreement|limited partnership agreement|\bllc agreement\b/.test(t)) return "operating_agreement";
  if (h.includes("subscription") || /subscription/.test(t)) return "subscription";
  return "other";
}

export function signerState(status: string | null | undefined): SignerState {
  const s = String(status ?? "").toLowerCase();
  if (s === "signed" || s === "completed") return "signed";
  if (s === "cancelled") return "cancelled";
  if (s === "declined" || s === "expired" || s === "error") return "problem";
  return "waiting";
}

export type ItemView = {
  status: "signed" | "waiting" | "problem";
  /** The signer whose turn it is now, if anyone. */
  waitingOn: RawSigner | null;
  /** Whole days since the item last moved. */
  waitingDays: number | null;
  stuck: boolean;
  label: string;
  signedCount: number;
  signerCount: number;
};

const dayMs = 86_400_000;
const time = (v: string | null | undefined) => (v ? new Date(v).getTime() : NaN);

export function itemView(item: RawItem, now: Date = new Date()): ItemView {
  const active = item.signers.filter((s) => signerState(s.status) !== "cancelled").sort((a, b) => a.order - b.order);
  const signedCount = active.filter((s) => signerState(s.status) === "signed").length;
  const problem = active.find((s) => signerState(s.status) === "problem");
  const nameOf = (s: RawSigner) => `${s.name?.trim() || "Signer"} (${ROLE_LABELS[s.role].toLowerCase()})`;
  if (problem) {
    const what = String(problem.status).toLowerCase() === "declined" ? "Declined by" : String(problem.status).toLowerCase() === "expired" ? "Expired for" : "Signing error for";
    return { status: "problem", waitingOn: problem, waitingDays: null, stuck: true, label: `${what} ${nameOf(problem)}`, signedCount, signerCount: active.length };
  }
  const waitingOn = active.find((s) => signerState(s.status) !== "signed") ?? null;
  if (item.executedAt || (!waitingOn && active.length > 0)) {
    return { status: "signed", waitingOn: null, waitingDays: null, stuck: false, label: "Signed by everyone", signedCount, signerCount: active.length };
  }
  const previous = waitingOn ? active.filter((s) => s.order < waitingOn.order).map((s) => time(s.signedAt)) : [];
  const since = Math.max(...[time(waitingOn?.sentAt), time(item.createdAt), ...previous].filter((n) => Number.isFinite(n)), Number.NEGATIVE_INFINITY);
  const waitingDays = Number.isFinite(since) ? Math.max(0, Math.floor((now.getTime() - since) / dayMs)) : null;
  const who = waitingOn ? nameOf(waitingOn) : "the investor";
  return {
    status: "waiting",
    waitingOn,
    waitingDays,
    stuck: waitingDays !== null && waitingDays >= STUCK_AFTER_DAYS,
    label: `Waiting on ${who}`,
    signedCount,
    signerCount: active.length,
  };
}

/** True when the waiting signer is the viewer. */
export function isViewersTurn(view: ItemView, viewer: { userId: string; email?: string | null }): boolean {
  const s = view.waitingOn;
  if (!s || view.status !== "waiting") return false;
  if (s.userId && s.userId === viewer.userId) return true;
  return !!s.email && !!viewer.email && s.email.trim().toLowerCase() === viewer.email.trim().toLowerCase();
}

export type StatusFilter = "all" | "waiting" | "stuck" | "signed";

export function matchesFilters(
  row: { view: ItemView; kind: AgreementKind; title: string; fundName: string; investorName: string | null; signers: RawSigner[] },
  f: { status: StatusFilter; kind: AgreementKind | "all"; search: string },
): boolean {
  if (f.kind !== "all" && row.kind !== f.kind) return false;
  if (f.status === "waiting" && row.view.status !== "waiting") return false;
  if (f.status === "stuck" && !row.view.stuck) return false;
  if (f.status === "signed" && row.view.status !== "signed") return false;
  const q = f.search.trim().toLowerCase();
  if (!q) return true;
  const hay = [row.title, row.fundName, row.investorName ?? "", ...row.signers.map((s) => `${s.name ?? ""} ${s.email ?? ""}`)].join(" ").toLowerCase();
  return hay.includes(q);
}

/** Waiting first (stuck and oldest on top), then problems, then signed newest first. */
export function sortRows<T extends { view: ItemView; createdAt: string | null }>(rows: T[]): T[] {
  const rank = (r: T) => (r.view.status === "problem" ? 0 : r.view.status === "waiting" ? 1 : 2);
  return [...rows].sort((a, b) => {
    const d = rank(a) - rank(b);
    if (d) return d;
    if (a.view.status === "waiting") return (b.view.waitingDays ?? -1) - (a.view.waitingDays ?? -1);
    return (time(b.createdAt) || 0) - (time(a.createdAt) || 0);
  });
}
